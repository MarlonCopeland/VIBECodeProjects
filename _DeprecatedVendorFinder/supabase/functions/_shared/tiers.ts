// supabase/functions/_shared/tiers.ts
// Deno port of the quota engine that mirrors src/config/tiers.js. Keep these in
// sync — the client uses the JS version for UX, the server uses this one to
// AUTHORITATIVELY enforce quotas. If you change tiers, update both.

export const FOLLOWER_GATE = 10;
export const UNLIMITED = Number.POSITIVE_INFINITY;

export const QUOTA_BUCKETS = {
  OPEN: "open_for_business",
  PROMOTIONS: "promotions",
  COMBINED: "combined",
};

export const NOTIFICATION_TYPES: Record<string, { key: string; quotaKey: string; label: string; defaultTitle: (n: string) => string }> = {
  open_for_business: {
    key: "open_for_business",
    quotaKey: "open_for_business",
    label: "Open For Business",
    defaultTitle: (n) => `${n} is open for business!`,
  },
  sale: {
    key: "sale",
    quotaKey: "promotions",
    label: "Sale",
    defaultTitle: (n) => `${n} is having a sale!`,
  },
  stock_update: {
    key: "stock_update",
    quotaKey: "promotions",
    label: "Stock Update",
    defaultTitle: (n) => `${n} posted an update`,
  },
};

type Tier = {
  id: string;
  priceMonthly: number;
  weeklyQuota: Record<string, number>;
};

export const TIERS: Record<string, Tier> = {
  free: {
    id: "free",
    priceMonthly: 0,
    weeklyQuota: { [QUOTA_BUCKETS.OPEN]: 1, [QUOTA_BUCKETS.PROMOTIONS]: 0 },
  },
  tier1: {
    id: "tier1",
    priceMonthly: 9.99,
    weeklyQuota: { [QUOTA_BUCKETS.OPEN]: 7, [QUOTA_BUCKETS.PROMOTIONS]: 0 },
  },
  tier2: {
    id: "tier2",
    priceMonthly: 19.99,
    weeklyQuota: { [QUOTA_BUCKETS.OPEN]: 7, [QUOTA_BUCKETS.PROMOTIONS]: 2 },
  },
  tier3: {
    id: "tier3",
    priceMonthly: 39.99,
    weeklyQuota: {
      [QUOTA_BUCKETS.OPEN]: 15,
      [QUOTA_BUCKETS.PROMOTIONS]: 15,
      [QUOTA_BUCKETS.COMBINED]: 15,
    },
  },
};

export function getTier(id: string): Tier {
  return TIERS[id] ?? TIERS.free;
}

export function getNotificationType(key: string) {
  return NOTIFICATION_TYPES[key] ?? null;
}

export function canSend(
  tierId: string,
  typeKey: string,
  usage: Record<string, number>,
) {
  const tier = getTier(tierId);
  const type = getNotificationType(typeKey);
  if (!type) {
    return { allowed: false, reason: "Unknown notification type", bucket: null, remaining: 0, limit: 0 };
  }
  const bucket = type.quotaKey;
  const limit = tier.weeklyQuota[bucket] ?? 0;
  const used = usage[bucket] ?? 0;

  const combinedLimit = tier.weeklyQuota[QUOTA_BUCKETS.COMBINED];
  const combinedUsed = usage[QUOTA_BUCKETS.COMBINED] ?? 0;
  if (combinedLimit != null && combinedUsed >= combinedLimit) {
    return {
      allowed: false,
      reason: `Weekly limit reached (${combinedLimit} of any type).`,
      bucket: QUOTA_BUCKETS.COMBINED,
      remaining: 0,
      limit: combinedLimit,
    };
  }
  if (used >= limit) {
    return {
      allowed: false,
      reason: limit === 0
        ? `Your plan does not include ${type.label} alerts.`
        : `Weekly limit reached for this alert type (${limit}/week).`,
      bucket,
      remaining: 0,
      limit,
    };
  }
  return { allowed: true, reason: "", bucket, remaining: limit - used - 1, limit };
}

export function bucketsForSend(tierId: string, typeKey: string): string[] {
  const tier = getTier(tierId);
  const type = getNotificationType(typeKey);
  if (!type) return [];
  const buckets = [type.quotaKey];
  if (tier.weeklyQuota[QUOTA_BUCKETS.COMBINED] != null) {
    buckets.push(QUOTA_BUCKETS.COMBINED);
  }
  return buckets;
}
