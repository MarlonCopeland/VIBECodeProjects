// src/features/payments/index.ts
// Public surface + manifest for the Payments & Subscriptions feature.
// Picks the Stripe provider when Supabase + a publishable key are configured,
// otherwise falls back to the local mock so the UI always works.

import { BACKEND, STRIPE_PUBLISHABLE_KEY } from '../../config/env';
import { FEATURE_MANIFESTS, isFeatureEnabled } from '../../config/features';
import { localPaymentProvider } from './LocalPaymentProvider';
import { stripePaymentProvider } from './StripePaymentProvider';
import type { PaymentProvider } from './types';

export const paymentProvider: PaymentProvider =
  BACKEND === 'supabase' && STRIPE_PUBLISHABLE_KEY
    ? stripePaymentProvider
    : localPaymentProvider;

export { TIERS, getTier } from './tiers';
export type { Tier, TierId, Subscription, SubscriptionStatus, CheckoutResult } from './types';

export const paymentsModule = {
  ...FEATURE_MANIFESTS.payments,
  enabled: isFeatureEnabled('payments'),
  provider: paymentProvider.id,
  routes: ['(app)/subscription'],
} as const;
