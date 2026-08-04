// src/features/payments/LocalPaymentProvider.ts
// Mock provider for demo/dev. Delegates to the local backend's vendor
// subscription record so the tier is the single source of truth (VendorTools
// quota reads reflect it immediately). "Succeeds" instantly — no Stripe keys.

import { backend } from '../../backend';
import type { CheckoutResult, PaymentProvider, Subscription, Tier } from './types';

export const localPaymentProvider: PaymentProvider = {
  id: 'local',

  async getSubscription(vendorId: string): Promise<Subscription> {
    const sub = await backend.subscriptions.get(vendorId);
    return sub ? { tier: sub.tier, status: sub.status } : { tier: 'free', status: 'none' };
  },

  async startCheckout(vendorId: string, tier: Tier): Promise<CheckoutResult> {
    const vendor = await backend.subscriptions.setTier(
      vendorId,
      tier.id,
      tier.id === 'free' ? 'none' : 'active',
    );
    return {
      status: 'completed',
      subscription: { tier: vendor.subscriptionTier, status: vendor.subscriptionStatus },
    };
  },

  async openManagement(_vendorId: string): Promise<void> {
    // No-op in demo mode.
  },
};
