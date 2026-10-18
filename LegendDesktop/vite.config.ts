// vite.config.ts — the desktop renderer.
//
// Legend desktop does NOT fork Legend's logic. Domain, storage, grading,
// circles, Knows Connections, CSV import/export, auth and sync all come
// straight from ../LegendNetworkingApp/src (alias `@legend`). Only the views
// are desktop-native (React DOM). Three mechanisms make that work:
//
//   1. Aliases send the handful of Expo/RN modules the shared code imports to
//      small shims in src/platform/shims (Platform/Linking/AppState, crypto,
//      constants, secure store...).
//   2. A redirect plugin swaps three shared modules for desktop versions:
//      the expo-sqlite driver -> IPC driver to node:sqlite in the main
//      process; secureStore -> Electron safeStorage; and backend/index (it
//      uses a CommonJS `require`, which ESM can't run) -> a static picker.
//   3. `dedupe` forces react / supabase / noble to resolve from THIS app's
//      node_modules, so there is exactly one React even though shared files
//      live in a sibling folder.
//
// Config comes from the same .env the phone app uses (so both clients talk
// to the same backend), with LegendDesktop/.env as an optional override.

import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, normalize } from 'node:path';

const MOBILE = resolve(__dirname, '../LegendNetworkingApp');
const SHARED_SRC = resolve(MOBILE, 'src');
const shim = (name: string) => resolve(__dirname, 'src/platform/shims', name);

const REDIRECTS: Record<string, string> = {
  [normalize(resolve(SHARED_SRC, 'backend/local/sql/expoSqlDriver.ts'))]: resolve(__dirname, 'src/platform/ipcSqlDriver.ts'),
  [normalize(resolve(SHARED_SRC, 'lib/secureStore.ts'))]: resolve(__dirname, 'src/platform/secureStore.ts'),
  [normalize(resolve(SHARED_SRC, 'backend/index.ts'))]: resolve(__dirname, 'src/platform/backend.ts'),
};

function redirectSharedModules(): Plugin {
  return {
    name: 'legend-desktop-redirects',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.startsWith('.')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const target = REDIRECTS[normalize(resolved.id.split('?')[0]!)];
      // backend.ts itself imports the real local/supabase backends; only
      // redirect imports coming from elsewhere.
      if (target && normalize(importer) !== normalize(target)) return target;
      return null;
    },
  };
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, MOBILE, ''), ...loadEnv(mode, __dirname, '') };

  // Mirrors `extra` in ../LegendNetworkingApp/app.config.js. Public values only.
  const extra = {
    backend: env.APP_BACKEND || 'local',
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY || '',
    scheme: env.APP_SCHEME || 'legend',
    webBaseUrl: env.WEB_BASE_URL || '',
    // OAuth needs a custom-scheme redirect back into the app; desktop signs
    // in with email + password and confirms with the emailed code.
    googleAuthEnabled: false,
    appleAuthEnabled: false,
    paletteStoreEnabled: flag(env.FEATURE_PALETTE_STORE, true),
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY || '',
    stripePriceTier1: env.STRIPE_PRICE_TIER1 || '',
    stripePriceTier2: env.STRIPE_PRICE_TIER2 || '',
    features: {
      auth: true,
      contacts: true,
      profile: flag(env.FEATURE_PROFILE, true),
      settings: flag(env.FEATURE_SETTINGS, true),
      // No push notifications on desktop.
      notifications: false,
      payments: flag(env.FEATURE_PAYMENTS, false),
      circles: flag(env.FEATURE_CIRCLES, true),
      outreach: flag(env.FEATURE_OUTREACH, true),
      sync: flag(env.FEATURE_SYNC, true),
      // Desktop sign-in requires owning Legend Full Suite (src/app/SuiteGate.tsx).
      fullSuite: flag(env.FEATURE_FULL_SUITE, true),
    },
  };

  return {
    base: './',
    plugins: [redirectSharedModules(), react()],
    define: {
      __LEGEND_EXTRA__: JSON.stringify(extra),
    },
    resolve: {
      alias: [
        { find: /^@legend\//, replacement: `${SHARED_SRC}/` },
        { find: /^react-native$/, replacement: shim('react-native.ts') },
        { find: /^expo-crypto$/, replacement: shim('expo-crypto.ts') },
        { find: /^expo-constants$/, replacement: shim('expo-constants.ts') },
        { find: /^expo-secure-store$/, replacement: shim('expo-secure-store.ts') },
        { find: /^expo-linking$/, replacement: shim('expo-linking.ts') },
        { find: /^expo-web-browser$/, replacement: shim('expo-web-browser.ts') },
        { find: /^expo-image-picker$/, replacement: shim('expo-image-picker.ts') },
        { find: /^@react-native-async-storage\/async-storage$/, replacement: shim('async-storage.ts') },
        { find: /^react-native-url-polyfill\/auto$/, replacement: shim('empty.ts') },
        { find: /^(expo-contacts|expo-document-picker|expo-file-system\/legacy|expo-sharing|expo-sms)$/, replacement: shim('phone-only.ts') },
      ],
      dedupe: ['react', 'react-dom', '@supabase/supabase-js', '@noble/ciphers'],
    },
    server: {
      port: 5183,
      strictPort: true,
      fs: { allow: [__dirname, SHARED_SRC] },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2500,
    },
  };
});
