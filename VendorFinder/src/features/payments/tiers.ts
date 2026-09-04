// src/features/payments/tiers.ts
// =============================================================================
// The CLIENT-FACING view of subscription tiers and notification types.
//
// The quota numbers and the send-decision logic are NOT defined here — they
// live in the runtime-agnostic engine at supabase/functions/_shared/quotaEngine,
// which the server-side edge function imports too. This module only layers on
// the things a server has no use for: display names, price labels, emoji,
// marketing copy, and Stripe price ids (which come from env and cannot be
// imported under Deno — that single import is why this logic used to be forked
// into a second, drifting copy).
//
// Change quotas or prices in the engine. Change how they READ here.
// =============================================================================

import { STRIPE_PRICE_IDS } from '../../config/env';
import {
  FREE_TIER_QUOTA,
  NOTIFICATION_TYPE_QUOTAS,
  TIER_ORDER,
  getTier as getTierQuota,
} from '../../../supabase/functions/_shared/quotaEngine';
import type { NotificationTypeKey, QuotaBucket } from '../../backend/types';
import type { Tier, TierId } from './types';

// Re-exported unchanged so callers keep importing tiers/payments, not the
// engine's path.
export {
  FOLLOWER_GATE,
  QUOTA_BUCKETS,
  canSend,
  bucketsForSend,
  requiresSubscription,
  startOfWeek,
} from '../../../supabase/functions/_shared/quotaEngine';
export type { SendDecision } from '../../../supabase/functions/_shared/quotaEngine';

// ---- Notification types (engine + presentation) -----------------------------

export interface NotificationType {
  key: NotificationTypeKey;
  label: string;
  description: string;
  emoji: string;
  /** Which quota bucket a send of this type draws from. */
  quotaKey: QuotaBucket;
  defaultTitle: (vendorName: string) => string;
}

/** Presentation-only fields, keyed by notification type. */
const NOTIFICATION_TYPE_UI: Record<NotificationTypeKey, { description: string; emoji: string }> = {
  open_for_business: {
    description: 'Alert followers you are open for business.',
    emoji: '🟢',
  },
  sale: {
    description: 'Alert followers you are having a sale.',
    emoji: '🏷️',
  },
  stock_update: {
    description: 'Alert followers you have new products or a general message.',
    emoji: '📦',
  },
};

export const NOTIFICATION_TYPE_LIST: NotificationType[] = Object.values(
  NOTIFICATION_TYPE_QUOTAS,
).map((quota) => ({ ...quota, ...NOTIFICATION_TYPE_UI[quota.key] }));

export const NOTIFICATION_TYPES: Record<string, NotificationType> = Object.fromEntries(
  NOTIFICATION_TYPE_LIST.map((t) => [t.key, t]),
);

/** Like the engine's lookup, but returns the presentation-enriched type. */
export function getNotificationType(key: string): NotificationType | null {
  return NOTIFICATION_TYPES[key] ?? null;
}

// ---- Tiers (engine + presentation) ------------------------------------------

/** Presentation-only fields, keyed by tier. */
const TIER_UI: Record<TierId, { name: string; priceLabel: string; priceId: string; features: string[] }> = {
  free: {
    name: 'Free',
    priceLabel: '$0',
    priceId: '',
    features: [`Up to ${FREE_TIER_QUOTA.weeklyQuota.open_for_business ?? 0} follower alert per week`],
  },
  tier1: {
    name: 'Vendor Tier 1',
    priceLabel: '$9.99/mo',
    priceId: STRIPE_PRICE_IDS.tier1,
    features: ['Unlimited followers', '7 “Open For Business” alerts per week'],
  },
  tier2: {
    name: 'Vendor Tier 2',
    priceLabel: '$19.99/mo',
    priceId: STRIPE_PRICE_IDS.tier2,
    features: [
      'Everything in Tier 1',
      '7 “Open For Business” alerts per week',
      '2 Sale / Stock Update alerts per week',
    ],
  },
  tier3: {
    name: 'Vendor Tier 3',
    priceLabel: '$39.99/mo',
    priceId: STRIPE_PRICE_IDS.tier3,
    features: ['Everything in Tier 2', '15 alerts of ANY type per week'],
  },
};

function buildTier(id: TierId): Tier {
  const { weeklyQuota, priceMonthly, order } = getTierQuota(id);
  return { id, priceMonthly, order, weeklyQuota, ...TIER_UI[id] };
}

export const TIERS: Tier[] = TIER_ORDER.map(buildTier);
export const FREE_TIER: Tier = buildTier('free');

/** Like the engine's lookup, but returns the presentation-enriched tier. */
export function getTier(tierId: string): Tier {
  return TIERS.find((t) => t.id === tierId) ?? FREE_TIER;
}

export function paidTiers(): Tier[] {
  return TIERS.filter((t) => t.priceMonthly > 0);
}
