// src/services/payments/StripePaymentProvider.js
// Stripe Checkout-based subscriptions. Works for web/PWA and native (via
// in-app browser). All secret operations happen in Supabase Edge Functions
// (`create-checkout-session`, `customer-portal`); the client only ever holds
// the PUBLISHABLE key and opens the returned hosted URL.
//
// NOTE on Apple: selling digital subscriptions inside an iOS app via Stripe
// violates App Store guideline 3.1.1 (must use IAP). This provider is ideal
// for the web/PWA path. To ship native iOS later, add an AppleIapProvider that
// implements PaymentProvider and select it in paymentService.js for iOS.

import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { PaymentProvider } from './PaymentProvider';
import { getSupabase } from '../backend/supabaseClient';
import {
  STRIPE_PUBLISHABLE_KEY, STRIPE_PRICE_IDS, WEB_BASE_URL, BACKEND,
} from '../../config/env';
import { resolveStripePriceId } from '../../config/tiers';

export class StripePaymentProvider extends PaymentProvider {
  get id() { return 'stripe'; }

  isAvailable() {
    // Requires the Supabase backend (Edge Functions host the secret logic) and
    // a publishable key.
    return BACKEND === 'supabase' && !!STRIPE_PUBLISHABLE_KEY;
  }

  async startCheckout({ vendorId, tier }) {
    const priceId = resolveStripePriceId(tier, STRIPE_PRICE_IDS);
    if (!priceId) {
      throw new Error(`No Stripe price configured for tier "${tier.id}".`);
    }
    const sb = getSupabase();
    const successUrl = `${WEB_BASE_URL || ''}/billing/success`;
    const cancelUrl = `${WEB_BASE_URL || ''}/billing/cancel`;

    const { data, error } = await sb.functions.invoke('create-checkout-session', {
      body: { vendorId, priceId, tierId: tier.id, successUrl, cancelUrl },
    });
    if (error) throw new Error(error.message || 'Could not start checkout');
    if (!data?.url) throw new Error('Checkout session did not return a URL');

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.assign(data.url);
      return { url: data.url, status: 'redirect' };
    }
    await WebBrowser.openBrowserAsync(data.url);
    return { url: data.url, status: 'pending' };
  }

  async openBillingPortal({ vendorId }) {
    const sb = getSupabase();
    const returnUrl = `${WEB_BASE_URL || ''}/billing`;
    const { data, error } = await sb.functions.invoke('customer-portal', {
      body: { vendorId, returnUrl },
    });
    if (error) throw new Error(error.message || 'Could not open billing portal');
    if (!data?.url) return { status: 'unsupported' };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.assign(data.url);
      return { url: data.url, status: 'redirect' };
    }
    await WebBrowser.openBrowserAsync(data.url);
    return { url: data.url, status: 'redirect' };
  }
}
