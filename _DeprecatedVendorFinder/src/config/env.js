// src/config/env.js
// Centralized runtime configuration, sourced from Expo's `extra` block
// (populated by app.config.js from process.env at build time) with safe
// fallbacks for local dev. Never hard-code secrets here; only PUBLIC values
// (anon keys, publishable keys, URLs) belong on the client.

import Constants from 'expo-constants';

const extra =
  Constants?.expoConfig?.extra ||
  Constants?.manifest?.extra || // legacy/dev fallback
  {};

// Which backend powers the app: 'local' (offline/demo) or 'supabase' (real).
export const BACKEND = extra.backend || 'local';

// Supabase (public values only — anon key is safe to ship).
export const SUPABASE_URL = extra.supabaseUrl || '';
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey || '';

// Stripe publishable key (safe to ship) + Price IDs for each paid tier.
export const STRIPE_PUBLISHABLE_KEY = extra.stripePublishableKey || '';
export const STRIPE_PRICE_TIER1 = extra.stripePriceTier1 || '';
export const STRIPE_PRICE_TIER2 = extra.stripePriceTier2 || '';
export const STRIPE_PRICE_TIER3 = extra.stripePriceTier3 || '';

// Map used by tiers.resolveStripePriceId(tier, STRIPE_PRICE_IDS).
export const STRIPE_PRICE_IDS = {
  STRIPE_PRICE_TIER1,
  STRIPE_PRICE_TIER2,
  STRIPE_PRICE_TIER3,
};

// Deep-link scheme for OAuth redirect + Stripe Checkout return.
export const APP_SCHEME = extra.scheme || 'vendorfinder';

// Base URL of deployed web app / PWA (used for Stripe success/cancel returns).
export const WEB_BASE_URL = extra.webBaseUrl || '';

// True when configured to use the real backend AND keys are present.
export const isSupabaseConfigured =
  BACKEND === 'supabase' && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
