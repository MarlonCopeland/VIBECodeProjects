// src/index.ts
// The `VendorFinder` namespace — a single, discoverable entry point that
// aggregates the whole framework: config, feature flags, the backend facade,
// the theme, shared UI, and every feature module with its manifest.
//
// Import surface:
//   import { VendorFinder } from '@app/index';
//   if (VendorFinder.features.vendorTools) { ... }
//   const vendors = await VendorFinder.backend.vendors.list();
//
// Individual modules can also be imported directly (tree-shaking friendly):
//   import { useAuth } from '@app/features/auth';

import { backend } from './backend';
import { Features, FEATURE_MANIFESTS, enabledFeatures, isFeatureEnabled } from './config/features';
import * as env from './config/env';
import { authModule } from './features/auth';
import { vendorsModule } from './features/vendors';
import { favoritesModule } from './features/favorites';
import { alertsModule } from './features/alerts';
import { vendorToolsModule } from './features/vendorTools';
import { adminModule } from './features/admin';
import { profileModule } from './features/profile';
import { notificationsModule } from './features/notifications';
import { paymentsModule } from './features/payments';

export const VendorFinder = {
  /** Build/runtime configuration (safe, public values only). */
  env,
  /** Resolved feature flags — the module registry. */
  features: Features,
  featureManifests: FEATURE_MANIFESTS,
  isFeatureEnabled,
  enabledFeatures,
  /** Active backend (local or Supabase), selected by config. */
  backend,
  /** Feature modules with their manifests + route lists. */
  modules: {
    auth: authModule,
    vendors: vendorsModule,
    favorites: favoritesModule,
    alerts: alertsModule,
    vendorTools: vendorToolsModule,
    admin: adminModule,
    profile: profileModule,
    notifications: notificationsModule,
    payments: paymentsModule,
  },
} as const;

export type VendorFinderFramework = typeof VendorFinder;

// Re-export the most commonly used pieces for convenience.
export { backend } from './backend';
export * from './backend/types';
export { useAuth, AuthProvider } from './features/auth';
export { useVendors, VendorProvider } from './features/vendors';
export { useTheme, ThemeProvider } from './theme';
