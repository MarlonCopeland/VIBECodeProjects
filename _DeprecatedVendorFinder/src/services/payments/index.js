// src/services/payments/index.js
// Payment service: selects the active PaymentProvider and exposes a small,
// provider-agnostic API to the UI. To add a new processor (Apple IAP,
// RevenueCat, Paddle), implement PaymentProvider and register it here.

import { BACKEND } from '../../config/env';
import { StripePaymentProvider } from './StripePaymentProvider';
import { LocalPaymentProvider } from './LocalPaymentProvider';

// --- provider selection ------------------------------------------------------
// Order matters: first available provider wins. On iOS native you might later
// prepend an AppleIapProvider here.
function selectProvider() {
  const candidates = BACKEND === 'supabase'
    ? [new StripePaymentProvider(), new LocalPaymentProvider()]
    : [new LocalPaymentProvider()];
  return candidates.find(p => p.isAvailable()) || new LocalPaymentProvider();
}

let provider = null;
export function getProvider() {
  if (!provider) provider = selectProvider();
  return provider;
}

// --- public API --------------------------------------------------------------
export function activeProviderId() {
  return getProvider().id;
}

/**
 * Begin a subscription purchase/upgrade.
 * @returns {Promise<{ status: 'redirect'|'completed'|'pending', url?: string }>}
 */
export async function subscribe({ vendorId, tier, currentUser }) {
  return getProvider().startCheckout({ vendorId, tier, currentUser });
}

/** Open the provider's manage/cancel surface. */
export async function manageBilling({ vendorId, currentUser }) {
  return getProvider().openBillingPortal({ vendorId, currentUser });
}
