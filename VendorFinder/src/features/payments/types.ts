// src/features/payments/types.ts
// Payment abstraction shared by all providers. Screens depend only on these
// types + the PaymentProvider interface, so Stripe can be swapped for another
// processor (or the local mock) without touching UI.
//
// In Vendor Finder a subscription belongs to a VENDOR (not a user): the tier is
// stored on the vendor record and drives the weekly broadcast quota. Providers
// are therefore keyed by `vendorId`.

import type {
  QuotaBucket,
  SubscriptionStatus,
  TierId,
} from '../../backend/types';

export type { QuotaBucket, SubscriptionStatus, TierId } from '../../backend/types';

export interface Tier {
  id: TierId;
  name: string;
  /** Human price label for the UI (e.g. "$9.99/mo"). */
  priceLabel: string;
  priceMonthly: number;
  /** Rank; higher = more powerful. */
  order: number;
  features: string[];
  /** Provider price id (e.g. Stripe price_...) — empty for the free tier. */
  priceId: string;
  /** Per-week send limits, keyed by quota bucket. Missing bucket => 0. */
  weeklyQuota: Partial<Record<QuotaBucket, number>>;
}

export interface Subscription {
  tier: TierId;
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
}

export interface CheckoutResult {
  status: 'completed' | 'canceled' | 'pending' | 'redirect';
  subscription?: Subscription;
  url?: string;
}

export interface PaymentProvider {
  readonly id: 'stripe' | 'local';
  /** Current subscription for the vendor. */
  getSubscription(vendorId: string): Promise<Subscription>;
  /** Begin checkout for a paid tier; resolves when the flow returns. */
  startCheckout(vendorId: string, tier: Tier): Promise<CheckoutResult>;
  /** Open the provider's customer portal / manage-subscription flow. */
  openManagement(vendorId: string): Promise<void>;
}
