// app.config.js
// Dynamic Expo configuration for the UnjadedDigital template.
//
// NOTE: This is intentionally plain JavaScript, not TypeScript. Expo's CLI
// loads a `.ts` config through a Node TypeScript loader, which fails on
// Node 20.19+/22 when plugin resolution transitively touches a package that
// ships TS source (expo-modules-core). A `.js` config sidesteps that loader
// entirely. (The rest of the app is TypeScript — Metro transpiles it.)
//
// This is the single build-time bridge between your environment (.env / EAS
// secrets) and the running app. Everything the client needs at runtime is
// copied into `extra`, then surfaced type-safely through `src/config/env.ts`.
// Only PUBLIC values belong here (anon keys, publishable keys, URLs) — never
// service-role keys or other secrets.
//
// Feature flags let each app built from this template turn whole modules
// on/off without touching code. See `src/config/features.ts`.

require('dotenv').config();

/** Coerce common truthy env strings to a boolean. Defaults to `fallback`. */
function flag(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

// Namespace defaults. Downstream apps override APP_NAME / APP_SLUG / SCHEME
// and the bundle identifiers in their own .env.
const APP_NAME = process.env.APP_NAME || 'Vendor Finder';
const APP_SLUG = process.env.APP_SLUG || 'vendorfinder';
const SCHEME = process.env.APP_SCHEME || 'vendorfinder';
const BUNDLE_ID = process.env.APP_BUNDLE_ID || 'com.vendorfinder.app';

module.exports = ({ config }) => ({
  ...config,
  name: APP_NAME,
  slug: APP_SLUG,
  scheme: SCHEME,
  version: process.env.APP_VERSION || '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0B0D12',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0B0D12',
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: [
    // NOTE: only list packages that ship a config plugin (app.plugin.js).
    // expo-web-browser has none — listing it makes config-plugins require() its
    // runtime entry, which pulls in expo-modules-core's TS source and crashes.
    'expo-router',
    'expo-asset',
    'expo-font',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#4C8BF5',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // ---- Backend selection -------------------------------------------------
    // 'local'  -> in-memory demo backend (no network, great for previews/tests)
    // 'supabase' -> real Supabase backend
    backend: process.env.APP_BACKEND || 'local',

    // ---- Supabase (public values only) ------------------------------------
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',

    // ---- Deep-link scheme + web base --------------------------------------
    scheme: SCHEME,
    webBaseUrl: process.env.WEB_BASE_URL || '',

    // ---- OAuth providers ---------------------------------------------------
    googleAuthEnabled: flag(process.env.AUTH_GOOGLE_ENABLED, true),
    appleAuthEnabled: flag(process.env.AUTH_APPLE_ENABLED, true),

    // ---- Payments (Stripe publishable values only) ------------------------
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    stripePriceTier1: process.env.STRIPE_PRICE_TIER1 || '',
    stripePriceTier2: process.env.STRIPE_PRICE_TIER2 || '',
    stripePriceTier3: process.env.STRIPE_PRICE_TIER3 || '',

    // ---- Feature flags (module registry) ----------------------------------
    // Flip these per app to include/exclude whole feature modules.
    features: {
      auth: true, // core; cannot be disabled
      vendors: true, // core to Vendor Finder; cannot be disabled
      favorites: flag(process.env.FEATURE_FAVORITES, true),
      alerts: flag(process.env.FEATURE_ALERTS, true),
      vendorTools: flag(process.env.FEATURE_VENDOR_TOOLS, true),
      admin: flag(process.env.FEATURE_ADMIN, true),
      profile: flag(process.env.FEATURE_PROFILE, true),
      settings: flag(process.env.FEATURE_SETTINGS, true),
      notifications: flag(process.env.FEATURE_NOTIFICATIONS, true),
      payments: flag(process.env.FEATURE_PAYMENTS, true),
    },

    router: {
      origin: false,
    },
    eas: {
      projectId: process.env.EAS_PROJECT_ID || '',
    },
  },
});
