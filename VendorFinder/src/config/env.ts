// src/config/env.ts
// Type-safe, centralized runtime configuration for the UnjadedDigital app.
//
// Values originate in `app.config.ts` (populated from process.env at build
// time) and arrive here via Expo Constants' `extra` block. This is the ONLY
// place the rest of the app should read configuration from — never touch
// `process.env` or `Constants` directly elsewhere.

import Constants from 'expo-constants';

type BackendMode = 'local' | 'supabase';

interface RawExtra {
  backend?: BackendMode;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  scheme?: string;
  webBaseUrl?: string;
  googleAuthEnabled?: boolean;
  appleAuthEnabled?: boolean;
  stripePublishableKey?: string;
  stripePriceTier1?: string;
  stripePriceTier2?: string;
  stripePriceTier3?: string;
  features?: Partial<Record<string, boolean>>;
}

const extra: RawExtra =
  (Constants?.expoConfig?.extra as RawExtra | undefined) ??
  // Legacy/dev fallback for older manifest shape.
  ((Constants as unknown as { manifest?: { extra?: RawExtra } })?.manifest
    ?.extra as RawExtra | undefined) ??
  {};

/** Which backend powers the app. */
export const BACKEND: BackendMode = extra.backend === 'supabase' ? 'supabase' : 'local';

/** Supabase public config (anon key is safe to ship). */
export const SUPABASE_URL = extra.supabaseUrl ?? '';
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? '';

/** Deep-link scheme used for OAuth + password-reset redirects. */
export const APP_SCHEME = extra.scheme ?? 'vendorfinder';

/** Base URL of the deployed web build (used for email redirect links). */
export const WEB_BASE_URL = extra.webBaseUrl ?? '';

/** OAuth provider availability. */
export const GOOGLE_AUTH_ENABLED = extra.googleAuthEnabled ?? false;
export const APPLE_AUTH_ENABLED = extra.appleAuthEnabled ?? false;

/** Stripe public config. */
export const STRIPE_PUBLISHABLE_KEY = extra.stripePublishableKey ?? '';
export const STRIPE_PRICE_IDS = {
  tier1: extra.stripePriceTier1 ?? '',
  tier2: extra.stripePriceTier2 ?? '',
  tier3: extra.stripePriceTier3 ?? '',
} as const;

/** True only when the real backend is selected AND keys are present. */
export const isSupabaseConfigured =
  BACKEND === 'supabase' && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

/** Raw feature overrides from app.config.ts (consumed by config/features.ts). */
export const RAW_FEATURE_OVERRIDES = extra.features ?? {};

/** Proximity radius (km) within which an open, followed vendor triggers a "nearby" alert. */
export const NEARBY_RADIUS_KM = 2;

/** How often the alert engine re-evaluates followed vendors (ms). */
export const ALERT_POLL_INTERVAL_MS = 60_000;
