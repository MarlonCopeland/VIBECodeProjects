// src/features/payments/StripePaymentProvider.ts
// Stripe provider using hosted Checkout + Customer Portal via Supabase Edge
// Functions (server-side, where the secret key lives). The client never sees
// the secret key — it calls the function and opens the returned URL.
//
// Edge Functions (see supabase/functions/):
//   - create-checkout-session  -> { url }
//   - customer-portal          -> { url }
// A vendor's tier is updated by the stripe-webhook function; getSubscription
// reads the resulting vendor record via the backend facade.

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getSupabase } from '../../backend/supabase/client';
import { backend } from '../../backend';
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

  async getSubscription(vendorId: string): Promise<Subscription> {
    const sub = await backend.subscriptions.get(vendorId);
    return sub ? { tier: sub.tier, status: sub.status } : { tier: 'free', status: 'none' };
  },

  async startCheckout(vendorId: string, tier: Tier): Promise<CheckoutResult> {
    if (!tier.priceId) throw new Error('This tier has no configured price.');
    const returnUrl = Linking.createURL('/subscription');
    const { url } = await invoke<{ url: string }>('create-checkout-session', {
      vendorId,
      priceId: tier.priceId,
      tierId: tier.id,
      successUrl: returnUrl,
      cancelUrl: returnUrl,
    });

    const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
    if (result.type !== 'success') return { status: 'canceled' };
    return { status: 'completed', subscription: await this.getSubscription(vendorId) };
  },

  async openManagement(vendorId: string): Promise<void> {
    const returnUrl = Linking.createURL('/subscription');
    const { url } = await invoke<{ url: string }>('customer-portal', { vendorId, returnUrl });
    await WebBrowser.openAuthSessionAsync(url, returnUrl);
  },
};
