// src/features/payments/tiers.ts
// =============================================================================
// SINGLE SOURCE OF TRUTH for subscription tiers, notification types, follower
// gating, and weekly quotas.
//
// Intentionally 100% data-driven so tiers/limits can change WITHOUT touching UI,
// backend, or quota-enforcement logic. Everything downstream (VendorTools,
// SubscriptionScreen, the local quota engine, and the Supabase Edge Function)
// reads from these structures. The quota engine at the bottom is pure and is
// shared verbatim by the local backend and the server-side edge function.
// =============================================================================

import { STRIPE_PRICE_IDS } from '../../config/env';
import type {
  NotificationTypeKey,
  QuotaBucket,
  WeeklyUsage,
} from '../../backend/types';
import type { Tier } from './types';

// ---- Notification types a vendor can broadcast to followers -----------------
export interface NotificationType {
  key: NotificationTypeKey;
  label: string;
  description: string;
  emoji: string;
  /** Which quota bucket a send of this type draws from. */
  quotaKey: QuotaBucket;
  defaultTitle: (vendorName: string) => string;
}

export const NOTIFICATION_TYPES: Record<string, NotificationType> = {
  OPEN_FOR_BUSINESS: {
    key: 'open_for_business',
    label: 'Open For Business',
    description: 'Alert followers you are open for business.',
    emoji: '🟢',
    quotaKey: 'open_for_business',
    defaultTitle: (vendorName) => `${vendorName} is open for business!`,
  },
  SALE: {
    key: 'sale',
    label: 'Sale',
    description: 'Alert followers you are having a sale.',
    emoji: '🏷️',
    quotaKey: 'promotions',
    defaultTitle: (vendorName) => `${vendorName} is having a sale!`,
  },
  STOCK_UPDATE: {
    key: 'stock_update',
    label: 'Stock Update',
    description: 'Alert followers you have new products or a general message.',
    emoji: '📦',
    quotaKey: 'promotions',
    defaultTitle: (vendorName) => `${vendorName} posted an update`,
  },
};

export const NOTIFICATION_TYPE_LIST: NotificationType[] = Object.values(NOTIFICATION_TYPES);

export function getNotificationType(key: string): NotificationType | null {
  return NOTIFICATION_TYPE_LIST.find((t) => t.key === key) ?? null;
}

// ---- Follower gating --------------------------------------------------------
// Below this follower count a vendor may send for free (FREE_TIER quota). At/above
// it, a paid subscription is REQUIRED to keep sending.
export const FOLLOWER_GATE = 10;

/** Quota bucket identifiers. Types map into buckets via `quotaKey`. */
export const QUOTA_BUCKETS: Record<string, QuotaBucket> = {
  OPEN: 'open_for_business',
  PROMOTIONS: 'promotions', // sale + stock updates
  COMBINED: 'combined', // any-type total cap
};

// =============================================================================
// TIERS
// =============================================================================

export const FREE_TIER: Tier = {
  id: 'free',
  name: 'Free',
  priceLabel: '$0',
  priceMonthly: 0,
  order: 0,
  priceId: '',
  // Free vendors: 1 "Open For Business" alert per week, nothing else.
  weeklyQuota: {
    open_for_business: 1,
    promotions: 0,
  },
  features: [`Up to ${FOLLOWER_GATE} followers`, '1 “Open For Business” alert per week'],
};

export const TIERS: Tier[] = [
  FREE_TIER,
  {
    id: 'tier1',
    name: 'Vendor Tier 1',
    priceLabel: '$9.99/mo',
    priceMonthly: 9.99,
    order: 1,
    priceId: STRIPE_PRICE_IDS.tier1,
    weeklyQuota: {
      open_for_business: 7,
      promotions: 0,
    },
    features: ['Unlimited followers', '7 “Open For Business” alerts per week'],
  },
  {
    id: 'tier2',
    name: 'Vendor Tier 2',
    priceLabel: '$19.99/mo',
    priceMonthly: 19.99,
    order: 2,
    priceId: STRIPE_PRICE_IDS.tier2,
    weeklyQuota: {
      open_for_business: 7,
      promotions: 2, // 2 Sale and/or Stock Updates per week
    },
    features: [
      'Everything in Tier 1',
      '7 “Open For Business” alerts per week',
      '2 Sale / Stock Update alerts per week',
    ],
  },
  {
    id: 'tier3',
    name: 'Vendor Tier 3',
    priceLabel: '$39.99/mo',
    priceMonthly: 39.99,
    order: 3,
    priceId: STRIPE_PRICE_IDS.tier3,
    // 15 updates of ANY type per week => a single combined cap.
    weeklyQuota: {
      open_for_business: 15,
      promotions: 15,
      combined: 15,
    },
    features: ['Everything in Tier 2', '15 alerts of ANY type per week'],
  },
];

// ---- Lookups ----------------------------------------------------------------
export function getTier(tierId: string): Tier {
  return TIERS.find((t) => t.id === tierId) ?? FREE_TIER;
}

export function paidTiers(): Tier[] {
  return TIERS.filter((t) => t.priceMonthly > 0);
}

// =============================================================================
// QUOTA ENGINE (pure, shared by the local backend AND the edge function)
// =============================================================================

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
 * given how many they've already sent this week per bucket.
 */
export function canSend(tierId: string, typeKey: string, usage: WeeklyUsage = {}): SendDecision {
  const tier = getTier(tierId);
  const type = getNotificationType(typeKey);
  if (!type) {
    return { allowed: false, reason: 'Unknown notification type', bucket: null, remaining: 0, limit: 0 };
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
 * Which buckets a send of `typeKey` should increment. Always includes the type's
 * own bucket; also increments COMBINED when the tier uses one.
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
