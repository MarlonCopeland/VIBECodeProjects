// src/features/payments/LocalPaymentProvider.ts
// Mock provider for demo/dev. Persists a fake subscription locally and
// "succeeds" instantly, so payment UI can be built without Stripe keys.

import { storage } from '../../lib/storage';
import type { CheckoutResult, PaymentProvider, Subscription, Tier } from './types';

const KEY = (userId: string) => `unjaded.subscription.${userId}`;

export const localPaymentProvider: PaymentProvider = {
  id: 'local',

  async getSubscription(userId: string): Promise<Subscription> {
    const raw = await storage.getItem(KEY(userId));
    if (!raw) return { tier: 'free', status: 'none' };
    try {
      return JSON.parse(raw) as Subscription;
    } catch {
      return { tier: 'free', status: 'none' };
    }
  },

  async startCheckout(userId: string, tier: Tier): Promise<CheckoutResult> {
    const subscription: Subscription = {
      tier: tier.id,
      status: tier.id === 'free' ? 'none' : 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
    };
    await storage.setItem(KEY(userId), JSON.stringify(subscription));
    return { status: 'completed', subscription };
  },

  async openManagement(_userId: string): Promise<void> {
    // No-op in demo mode.
  },
};
