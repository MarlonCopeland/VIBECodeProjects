// src/features/payments/StripePaymentProvider.ts
// Stripe provider using hosted Checkout + Customer Portal via a Supabase Edge
// Function (server-side, where the secret key lives). The client never sees
// the secret key — it calls the function and opens the returned URL.
//
// Expected Edge Functions (see supabase/functions/ in your own project):
//   - create-checkout-session  -> { url }
//   - create-portal-session    -> { url }
//   - get-subscription         -> Subscription
//
// This keeps the template secure-by-default: no card handling on-device.

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getSupabase } from '../../backend/supabase/client';
import type { CheckoutResult, PaymentProvider, Subscription, Tier } from './types';

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke<T>(fn, { body });
  if (error) throw error;
  if (data == null) throw new Error(`Edge function ${fn} returned no data.`);
  return data;
}

export const stripePaymentProvider: PaymentProvider = {
  id: 'stripe',

  async getSubscription(userId: string): Promise<Subscription> {
    try {
      return await invoke<Subscription>('get-subscription', { userId });
    } catch {
      return { tier: 'free', status: 'none' };
    }
  },

  async startCheckout(userId: string, tier: Tier): Promise<CheckoutResult> {
    if (!tier.priceId) throw new Error('This tier has no configured price.');
    const returnUrl = Linking.createURL('/subscription');
    const { url } = await invoke<{ url: string }>('create-checkout-session', {
      userId,
      priceId: tier.priceId,
      successUrl: returnUrl,
      cancelUrl: returnUrl,
    });

    const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
    if (result.type !== 'success') return { status: 'canceled' };
    return { status: 'completed', subscription: await this.getSubscription(userId) };
  },

  async openManagement(userId: string): Promise<void> {
    const returnUrl = Linking.createURL('/subscription');
    const { url } = await invoke<{ url: string }>('create-portal-session', {
      userId,
      returnUrl,
    });
    await WebBrowser.openAuthSessionAsync(url, returnUrl);
  },
};
