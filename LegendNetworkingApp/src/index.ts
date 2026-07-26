// src/index.ts
// The `UnjadedDigital` namespace — a single, discoverable entry point that
// aggregates the whole framework: config, feature flags, the backend facade,
// the theme, shared UI, and every feature module with its manifest.
//
// Import surface:
//   import { UnjadedDigital } from '@app/index';
//   if (UnjadedDigital.features.payments) { ... }
//   const user = await UnjadedDigital.backend.auth.getSession();
//
// Individual modules can also be imported directly (tree-shaking friendly):
//   import { useAuth } from '@app/features/auth';

import { backend } from './backend';
import { Features, FEATURE_MANIFESTS, enabledFeatures, isFeatureEnabled } from './config/features';
import * as env from './config/env';
import { authModule } from './features/auth';
import { contactsModule } from './features/contacts';
import { circlesModule } from './features/circles';
import { outreachModule } from './features/outreach';
import { profileModule } from './features/profile';
import { notificationsModule } from './features/notifications';
import { paymentsModule } from './features/payments';

export const UnjadedDigital = {
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
    contacts: contactsModule,
    circles: circlesModule,
    outreach: outreachModule,
    profile: profileModule,
    notifications: notificationsModule,
    payments: paymentsModule,
  },
} as const;

export type UnjadedDigitalFramework = typeof UnjadedDigital;

/** Legend is built on the UnjadedDigital template; same object, app-named. */
export const Legend = UnjadedDigital;

// Re-export the most commonly used pieces for convenience.
export { backend } from './backend';
export * from './backend/types';
export { useAuth, AuthProvider } from './features/auth';
export { useContacts, ContactsProvider } from './features/contacts';
export { useTheme, ThemeProvider } from './theme';
