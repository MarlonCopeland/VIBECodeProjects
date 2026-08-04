// app.config.js
// Dynamic Expo config. Replaces the static app.json so we can inject
// environment variables (Supabase, Stripe, backend selection) into `extra`,
// which src/config/env.js reads at runtime.
//
// Local dev: create a .env file (see .env.example) — values are read via
// process.env. EAS Build: set these as EAS "secrets"/env vars.

require('dotenv').config();

const SCHEME = 'vendorfinder';

module.exports = ({ config }) => ({
  ...config,
  name: 'Vendor Finder',
  slug: 'vendor-finder-app',
  version: '0.1.0',
  scheme: SCHEME, // enables OAuth + Stripe deep-link returns
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#4a6cf7',
  },
  platforms: ['ios', 'android', 'web'],
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.vendorfinder.app',
    buildNumber: '1',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'We use your location to find nearby pop-up vendors.',
      // Required so Stripe/OAuth web sessions can open in-app browser.
      LSApplicationQueriesSchemes: ['https'],
    },
  },
  android: {
    package: 'com.vendorfinder.app',
    versionCode: 1,
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#4a6cf7',
    },
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
    // PWA manifest — supports the "host on web / PWA" path.
    name: 'Vendor Finder',
    shortName: 'VendorFinder',
    themeColor: '#4a6cf7',
    backgroundColor: '#ffffff',
    display: 'standalone',
    startUrl: '/',
  },
  plugins: [
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Allow Vendor Finder to use your location to find nearby pop-up vendors.',
      },
    ],
    [
      'expo-notifications',
      {
        // Use defaults; icon/color can be customized later.
        color: '#4a6cf7',
      },
    ],
  ],
  extra: {
    // Backend selection
    backend: process.env.APP_BACKEND || 'local',

    // Supabase (public)
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',

    // Stripe (public publishable key + per-tier price ids)
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    stripePriceTier1: process.env.STRIPE_PRICE_TIER1 || '',
    stripePriceTier2: process.env.STRIPE_PRICE_TIER2 || '',
    stripePriceTier3: process.env.STRIPE_PRICE_TIER3 || '',

    // Deep-link + web
    scheme: SCHEME,
    webBaseUrl: process.env.WEB_BASE_URL || '',

    // EAS project linkage (filled by `eas init`)
    eas: {
      projectId: process.env.EAS_PROJECT_ID || '',
    },
  },
});
