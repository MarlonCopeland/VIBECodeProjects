// src/features/payments/types.ts
// Payment abstraction shared by all providers. Screens depend only on these
// types + the PaymentProvider interface, so Stripe can be swapped for another
// processor (or the local mock) without touching UI.

export type TierId = 'free' | 'tier1' | 'tier2';

export interface Tier {
  id: TierId;
  name: string;
  priceLabel: string;
  features: string[];
  /** Provider price id (e.g. Stripe price_...) — empty for the free tier. */
  priceId: string;
}

export type SubscriptionStatus = 'active' | 'trialing' | 'canceled' | 'none';

export interface Subscription {
  tier: TierId;
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
}

export interface CheckoutResult {
  status: 'completed' | 'canceled' | 'pending';
  subscription?: Subscription;
}

export interface PaymentProvider {
  readonly id: 'stripe' | 'local';
  /** Current subscription for the user. */
  getSubscription(userId: string): Promise<Subscription>;
  /** Begin checkout for a paid tier; resolves when the flow returns. */
  startCheckout(userId: string, tier: Tier): Promise<CheckoutResult>;
  /** Open the provider's customer portal / manage-subscription flow. */
  openManagement(userId: string): Promise<void>;
}
