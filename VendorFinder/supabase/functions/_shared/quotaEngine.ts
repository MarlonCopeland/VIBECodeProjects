// supabase/functions/_shared/quotaEngine.ts
// =============================================================================
// SINGLE SOURCE OF TRUTH for subscription quotas and the send decision.
//
// Imported by BOTH runtimes:
//   - the Deno edge function (../send-notification/index.ts), which enforces
//     quotas authoritatively, and
//   - the React Native client (src/features/payments/tiers.ts), which wraps
//     these values with UI metadata (emoji, price labels, marketing copy).
//
// It therefore has ZERO imports and uses no Deno-, Node-, or React-specific
// APIs, so it loads unchanged in both. KEEP IT THAT WAY — a single runtime
// specific import here is exactly what forced this logic to be forked into two
// copies (which then silently drifted) before it was unified.
//
// It lives under supabase/functions/_shared/ because the Supabase CLI is only
// guaranteed to bundle files inside that tree when deploying an edge function.
// =============================================================================

export type QuotaBucket = 'open_for_business' | 'promotions' | 'combined';
export type NotificationTypeKey = 'open_for_business' | 'sale' | 'stock_update';
export type TierId = 'free' | 'tier1' | 'tier2' | 'tier3';

/** How many sends a vendor has already made this week, per bucket. */
export type WeeklyUsage = Partial<Record<QuotaBucket, number>>;

/**
 * Below this follower count a vendor may send on the free tier. At or above it
 * a paid subscription is required to keep sending.
 */
export const FOLLOWER_GATE = 10;

export const QUOTA_BUCKETS: Record<string, QuotaBucket> = {
  OPEN: 'open_for_business',
  PROMOTIONS: 'promotions', // sale + stock updates
  COMBINED: 'combined', // any-type total cap
};

// ---- Notification types -----------------------------------------------------

/** The quota-relevant half of a notification type. The client adds emoji etc. */
export interface QuotaNotificationType {
  key: NotificationTypeKey;
  label: string;
  /** Which quota bucket a send of this type draws from. */
  quotaKey: QuotaBucket;
  defaultTitle: (vendorName: string) => string;
}

export const NOTIFICATION_TYPE_QUOTAS: Record<string, QuotaNotificationType> = {
  open_for_business: {
    key: 'open_for_business',
    label: 'Open For Business',
    quotaKey: 'open_for_business',
    defaultTitle: (vendorName) => `${vendorName} is open for business!`,
  },
  sale: {
    key: 'sale',
    label: 'Sale',
    quotaKey: 'promotions',
    defaultTitle: (vendorName) => `${vendorName} is having a sale!`,
  },
  stock_update: {
    key: 'stock_update',
    label: 'Stock Update',
    quotaKey: 'promotions',
    defaultTitle: (vendorName) => `${vendorName} posted an update`,
  },
};

export function getNotificationType(key: string): QuotaNotificationType | null {
  return NOTIFICATION_TYPE_QUOTAS[key] ?? null;
}

// ---- Tiers ------------------------------------------------------------------

/** The quota-relevant half of a tier. The client adds names/labels/features. */
export interface TierQuota {
  id: TierId;
  priceMonthly: number;
  /** Rank; higher = more powerful. */
  order: number;
  /** Per-week send limits, keyed by quota bucket. Missing bucket => 0. */
  weeklyQuota: Partial<Record<QuotaBucket, number>>;
}

export const FREE_TIER_QUOTA: TierQuota = {
  id: 'free',
  priceMonthly: 0,
  order: 0,
  // Free vendors: 1 "Open For Business" alert per week, nothing else.
  weeklyQuota: { open_for_business: 1, promotions: 0 },
};

export const TIER_QUOTAS: Record<string, TierQuota> = {
  free: FREE_TIER_QUOTA,
  tier1: {
    id: 'tier1',
    priceMonthly: 9.99,
    order: 1,
    weeklyQuota: { open_for_business: 7, promotions: 0 },
  },
  tier2: {
    id: 'tier2',
    priceMonthly: 19.99,
    order: 2,
    weeklyQuota: { open_for_business: 7, promotions: 2 },
  },
  tier3: {
    id: 'tier3',
    priceMonthly: 39.99,
    order: 3,
    // 15 updates of ANY type per week => a single combined cap.
    weeklyQuota: { open_for_business: 15, promotions: 15, combined: 15 },
  },
};

/** Tier ids in display order. */
export const TIER_ORDER: TierId[] = ['free', 'tier1', 'tier2', 'tier3'];

export function getTier(tierId: string): TierQuota {
  return TIER_QUOTAS[tierId] ?? FREE_TIER_QUOTA;
}

// ---- Quota engine (pure) ----------------------------------------------------

/** Start-of-week timestamp (Monday 00:00 local). Weekly windows reset here. */
export function startOfWeek(now: number = Date.now()): number {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export interface SendDecision {
  allowed: boolean;
  reason?: string;
  bucket: QuotaBucket | null;
  remaining: number;
  limit: number;
}

/**
 * Decide whether a vendor on `tierId` may send a notification of `typeKey`,
 * given how many they have already sent this week per bucket.
 */
export function canSend(
  tierId: string,
  typeKey: string,
  usage: WeeklyUsage = {},
): SendDecision {
  const tier = getTier(tierId);
  const type = getNotificationType(typeKey);
  if (!type) {
    return {
      allowed: false,
      reason: 'Unknown notification type',
      bucket: null,
      remaining: 0,
      limit: 0,
    };
  }

  const bucket = type.quotaKey;
  const limit = tier.weeklyQuota[bucket] ?? 0;
  const used = usage[bucket] ?? 0;

  // Combined cap (e.g. Tier 3: any-type total).
  const combinedLimit = tier.weeklyQuota.combined;
  const combinedUsed = usage.combined ?? 0;
  if (combinedLimit != null && combinedUsed >= combinedLimit) {
    return {
      allowed: false,
      reason: `Weekly limit reached (${combinedLimit} of any type).`,
      bucket: 'combined',
      remaining: 0,
      limit: combinedLimit,
    };
  }

  if (used >= limit) {
    return {
      allowed: false,
      reason:
        limit === 0
          ? `Your plan does not include ${type.label} alerts.`
          : `Weekly limit reached for this alert type (${limit}/week).`,
      bucket,
      remaining: 0,
      limit,
    };
  }

  return { allowed: true, bucket, remaining: limit - used - 1, limit };
}

/**
 * Which buckets a send of `typeKey` should increment. Always includes the
 * type's own bucket; also increments COMBINED when the tier uses one.
 */
export function bucketsForSend(tierId: string, typeKey: string): QuotaBucket[] {
  const tier = getTier(tierId);
  const type = getNotificationType(typeKey);
  if (!type) return [];
  const buckets: QuotaBucket[] = [type.quotaKey];
  if (tier.weeklyQuota.combined != null) buckets.push('combined');
  return buckets;
}

/**
 * Does this vendor need a paid subscription to send right now? True once they
 * cross the follower gate and are still on the free tier.
 */
export function requiresSubscription(followerCount: number, tierId: string): boolean {
  return followerCount >= FOLLOWER_GATE && getTier(tierId).priceMonthly === 0;
}
