// src/config/tiers.js
// =============================================================================
// SINGLE SOURCE OF TRUTH for subscription tiers, notification types, follower
// gating, and weekly quotas.
//
// This file is intentionally 100% data-driven so product/business can add,
// remove, or re-price tiers and change per-type weekly limits WITHOUT touching
// any UI, backend, or quota-enforcement logic. Everything downstream
// (VendorTools, SubscriptionScreen, local quota engine, and the Supabase
// Edge Function) reads from these structures.
//
// To change the rules you typically only edit:
//   - FOLLOWER_GATE                  (min followers before a vendor must subscribe)
//   - NOTIFICATION_TYPES             (the kinds of alerts a vendor can send)
//   - TIERS[].weeklyQuota            (per-type weekly send limits)
//   - TIERS[].features               (free-form marketing/feature flags)
//   - FREE_TIER.weeklyQuota          (what a non-subscribed vendor gets)
// =============================================================================

// ---- Notification types a vendor can broadcast to followers -----------------
// `key` is stored on each notification row; `quotaKey` maps a type to the quota
// bucket it draws from. Multiple types can share a bucket (e.g. Sale + Stock).
export const NOTIFICATION_TYPES = {
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

// Convenience: list + lookup by stored key.
export const NOTIFICATION_TYPE_LIST = Object.values(NOTIFICATION_TYPES);
export function getNotificationType(key) {
  return NOTIFICATION_TYPE_LIST.find((t) => t.key === key) || null;
}

// ---- Follower gating --------------------------------------------------------
// Below this follower count a vendor may send for free (FREE_TIER quota).
// At/above it, a paid subscription is REQUIRED to keep sending. Change freely.
export const FOLLOWER_GATE = 10;

// A sentinel meaning "no weekly limit" (used by the top tier's combined bucket).
export const UNLIMITED = Number.POSITIVE_INFINITY;

// ---- Quota bucket identifiers ----------------------------------------------
// Buckets are what we actually count against. Types map into buckets via
// `quotaKey` above. A tier may also define a `combined` bucket that caps the
// TOTAL across every type (used by Tier 3: "15 of any type per week").
export const QUOTA_BUCKETS = {
  OPEN: 'open_for_business',
  PROMOTIONS: 'promotions', // sale + stock updates
  COMBINED: 'combined',     // any-type total cap
};

// =============================================================================
// TIERS
// =============================================================================
// Each tier:
//   id            stable identifier persisted on the vendor (subscription_tier)
//   name          display name
//   priceMonthly  number (USD); 0 for free
//   stripePriceId env var name holding the Stripe Price ID (kept out of code)
//   order         sort order / rank (higher = more powerful)
//   weeklyQuota   { [bucket]: number }  per-week send limits
//   features      string[] for marketing + capability gating in the UI
//
// Quota semantics (enforced identically in localBackend + the Edge Function):
//   - For a given notification type, find its `quotaKey` (bucket).
//   - The send is allowed if usage[bucket] < weeklyQuota[bucket]
//     AND (no `combined` bucket defined OR usage.combined < weeklyQuota.combined).
//   - Missing bucket in weeklyQuota => 0 allowed for that bucket.
// =============================================================================

export const FREE_TIER = {
  id: 'free',
  name: 'Free',
  priceMonthly: 0,
  stripePriceId: null,
  order: 0,
  // Free vendors: 1 "Open For Business" alert per week, nothing else.
  weeklyQuota: {
    [QUOTA_BUCKETS.OPEN]: 1,
    [QUOTA_BUCKETS.PROMOTIONS]: 0,
  },
  features: [
    'Up to ' + FOLLOWER_GATE + ' followers',
    '1 “Open For Business” alert per week',
  ],
};

export const TIERS = [
  FREE_TIER,
  {
    id: 'tier1',
    name: 'Vendor Tier 1',
    priceMonthly: 9.99,
    stripePriceId: 'STRIPE_PRICE_TIER1', // resolved from env at runtime
    order: 1,
    weeklyQuota: {
      [QUOTA_BUCKETS.OPEN]: 7,
      [QUOTA_BUCKETS.PROMOTIONS]: 0,
    },
    features: [
      'Unlimited followers',
      '7 “Open For Business” alerts per week',
    ],
  },
  {
    id: 'tier2',
    name: 'Vendor Tier 2',
    priceMonthly: 19.99,
    stripePriceId: 'STRIPE_PRICE_TIER2',
    order: 2,
    weeklyQuota: {
      [QUOTA_BUCKETS.OPEN]: 7,
      [QUOTA_BUCKETS.PROMOTIONS]: 2, // 2 Sale and/or Stock Updates per week
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
    priceMonthly: 39.99,
    stripePriceId: 'STRIPE_PRICE_TIER3',
    order: 3,
    // 15 updates of ANY type per week => a single combined cap.
    weeklyQuota: {
      [QUOTA_BUCKETS.OPEN]: 15,
      [QUOTA_BUCKETS.PROMOTIONS]: 15,
      [QUOTA_BUCKETS.COMBINED]: 15,
    },
    features: [
      'Everything in Tier 2',
      '15 alerts of ANY type per week',
    ],
  },
];

// ---- Lookups ----------------------------------------------------------------
export function getTier(tierId) {
  return TIERS.find((t) => t.id === tierId) || FREE_TIER;
}

export function paidTiers() {
  return TIERS.filter((t) => t.priceMonthly > 0);
}

// Resolve a tier's Stripe price id from injected env (see config/env.js).
export function resolveStripePriceId(tier, env) {
  if (!tier?.stripePriceId) return null;
  return env?.[tier.stripePriceId] || null;
}

// =============================================================================
// QUOTA ENGINE (pure, shared by local backend AND the Edge Function)
// =============================================================================

// Start-of-week timestamp (Monday 00:00 local). Weekly windows reset here.
export function startOfWeek(now = Date.now()) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

/**
 * Decide whether a vendor on `tierId` may send a notification of `typeKey`,
 * given how many they've already sent this week per bucket.
 *
 * @param {string} tierId
 * @param {string} typeKey         a NOTIFICATION_TYPES[].key
 * @param {object} usage           { [bucket]: number } counts this week
 * @returns {{ allowed: boolean, reason?: string, bucket: string,
 *            remaining: number, limit: number }}
 */
export function canSend(tierId, typeKey, usage = {}) {
  const tier = getTier(tierId);
  const type = getNotificationType(typeKey);
  if (!type) {
    return { allowed: false, reason: 'Unknown notification type', bucket: null, remaining: 0, limit: 0 };
  }
  const bucket = type.quotaKey;
  const limit = tier.weeklyQuota[bucket] ?? 0;
  const used = usage[bucket] ?? 0;

  // Combined cap (e.g. Tier 3: any-type total).
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

  return {
    allowed: true,
    bucket,
    remaining: limit === UNLIMITED ? UNLIMITED : limit - used - 1,
    limit,
  };
}

/**
 * Which buckets a send of `typeKey` should increment. Always includes the
 * type's own bucket; also increments COMBINED when the tier uses one.
 */
export function bucketsForSend(tierId, typeKey) {
  const tier = getTier(tierId);
  const type = getNotificationType(typeKey);
  if (!type) return [];
  const buckets = [type.quotaKey];
  if (tier.weeklyQuota[QUOTA_BUCKETS.COMBINED] != null) {
    buckets.push(QUOTA_BUCKETS.COMBINED);
  }
  return buckets;
}

/**
 * Does this vendor need a paid subscription to send right now?
 * True once they cross the follower gate and are still on the free tier.
 */
export function requiresSubscription(followerCount, tierId) {
  return followerCount >= FOLLOWER_GATE && getTier(tierId).priceMonthly === 0;
}
