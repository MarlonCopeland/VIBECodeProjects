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
const APP_NAME = process.env.APP_NAME || 'Legend';
const APP_SLUG = process.env.APP_SLUG || 'legend';
const SCHEME = process.env.APP_SCHEME || 'legend';
const BUNDLE_ID = process.env.APP_BUNDLE_ID || 'com.unjadeddigital.legend';

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
    config: {
      // Standard HTTPS only — answers Apple's export-compliance question up
      // front so every TestFlight upload doesn't stop to ask.
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0B0D12',
    },
    // Legend only READS the phone book (one-way import) and never writes back,
    // and it never opens the camera. Libraries add these by default; Play
    // Console makes you justify every sensitive permission you declare, so
    // don't declare ones the app doesn't use.
    blockedPermissions: [
      'android.permission.WRITE_CONTACTS',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
    ],
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
    [
      'expo-secure-store',
      {
        // SecureStore is used for the auth session and the sync vault key,
        // never with requireAuthentication, so Face ID is never invoked.
        // Don't declare a biometric purpose string we don't use.
        faceIDPermission: false,
      },
    ],
    [
      'expo-contacts',
      {
        contactsPermission:
          `Allow ${APP_NAME} to import your phone contacts. They stay on your device / in your own account — nothing is shared.`,
      },
    ],
    'expo-sqlite',
    [
      'expo-image-picker',
      {
        // Required purpose string — avatar upload uses the photo library, and
        // Apple auto-rejects photo access without NSPhotoLibraryUsageDescription.
        photosPermission:
          `Allow ${APP_NAME} to access your photo library so you can pick a profile photo. Photos are only used for the avatar you choose.`,
        // profileService only calls launchImageLibraryAsync — the camera and
        // mic are never used, so decline the permissions this plugin would
        // otherwise add. Undeclared-but-requested permissions are friction in
        // Play Console review and an easy Apple rejection.
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          `${APP_NAME} uses your location once, when you add a contact, to prefill where you met. It is never tracked or shared.`,
        // Drop the "Always" variants the plugin adds by default. Legend only
        // ever asks for when-in-use, one shot, on the add-contact screen —
        // shipping an unjustified background-location string invites an App
        // Review question we have no answer for.
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
      },
    ],
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

    // ---- Premium palette store UI -----------------------------------------
    // Shows $ prices + Unlock buttons for premium palettes. Fine for INTERNAL
    // TestFlight, but Apple rejects visible prices without real StoreKit IAP
    // (Guideline 3.1.1), so eas.json forces this off for external/release
    // builds until IAP lands.
    paletteStoreEnabled: flag(process.env.FEATURE_PALETTE_STORE, true),

    // ---- Payments (Stripe publishable values only) ------------------------
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    stripePriceTier1: process.env.STRIPE_PRICE_TIER1 || '',
    stripePriceTier2: process.env.STRIPE_PRICE_TIER2 || '',

    // ---- Feature flags (module registry) ----------------------------------
    // Flip these per app to include/exclude whole feature modules.
    features: {
      auth: true, // core; cannot be disabled
      contacts: true, // core to Legend; cannot be disabled
      profile: flag(process.env.FEATURE_PROFILE, true),
      settings: flag(process.env.FEATURE_SETTINGS, true),
      notifications: flag(process.env.FEATURE_NOTIFICATIONS, true),
      payments: flag(process.env.FEATURE_PAYMENTS, false),
      circles: flag(process.env.FEATURE_CIRCLES, true),
      outreach: flag(process.env.FEATURE_OUTREACH, true),
      sync: flag(process.env.FEATURE_SYNC, true),
    },

    router: {
      origin: false,
    },
    eas: {
      // Hardcoded fallback so cloud builds resolve the project even though
      // .env (which also carries this) is gitignored and not uploaded.
      projectId: process.env.EAS_PROJECT_ID || '9a2a8a94-9199-468a-a479-98c5b1627a54',
    },
  },
});
