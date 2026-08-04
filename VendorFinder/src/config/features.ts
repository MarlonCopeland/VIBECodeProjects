// src/config/features.ts
// The module registry. This is what makes the app modular: every optional
// feature is a flag, so an app built from this scaffold can include or exclude
// whole modules without deleting code.
//
// Flags are resolved once from `app.config.js` -> Constants.extra.features
// (see env.ts). Read them via `isFeatureEnabled(...)` or the `Features` object;
// drive conditional navigation/UI off the result.

import { RAW_FEATURE_OVERRIDES } from './env';

export const FEATURE_IDS = [
  'auth',
  'vendors',
  'favorites',
  'alerts',
  'vendorTools',
  'admin',
  'profile',
  'settings',
  'notifications',
  'payments',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

export type FeatureFlags = Record<FeatureId, boolean>;

/** Metadata describing each module — used by docs, settings UI, and tooling. */
export interface FeatureManifest {
  id: FeatureId;
  title: string;
  description: string;
  /** Core modules cannot be disabled (the app cannot function without them). */
  core: boolean;
}

export const FEATURE_MANIFESTS: Record<FeatureId, FeatureManifest> = {
  auth: {
    id: 'auth',
    title: 'Authentication & Security',
    description:
      'Email/password, OAuth, magic link, password reset, email verification, roles, and admin impersonation.',
    core: true,
  },
  vendors: {
    id: 'vendors',
    title: 'Vendor Discovery',
    description: 'Browse, search, and view pop-up vendors with live open status and distance.',
    core: true,
  },
  favorites: {
    id: 'favorites',
    title: 'Favorites & Following',
    description: 'Follow vendors, view your favorites, and let vendors manage their followers.',
    core: false,
  },
  alerts: {
    id: 'alerts',
    title: 'Location Alerts',
    description: 'Proximity + open-now alerts for followed vendors, with an in-app alert history.',
    core: false,
  },
  vendorTools: {
    id: 'vendorTools',
    title: 'Vendor Tools',
    description: 'Vendor open toggle, schedule editor, follower management, and quota-limited broadcasts.',
    core: false,
  },
  admin: {
    id: 'admin',
    title: 'Admin Console',
    description: 'User directory and one-tap impersonation of any account.',
    core: false,
  },
  profile: {
    id: 'profile',
    title: 'Profile Management',
    description: 'View/edit profile, interests, avatar upload, and delete account.',
    core: false,
  },
  settings: {
    id: 'settings',
    title: 'Settings & Theming',
    description: 'App settings, light/dark theme control, and preferences.',
    core: false,
  },
  notifications: {
    id: 'notifications',
    title: 'Push Notifications',
    description: 'Expo push token registration and in-app notification handling.',
    core: false,
  },
  payments: {
    id: 'payments',
    title: 'Payments & Subscriptions',
    description: 'Stripe-backed vendor subscription tiers with a pluggable payment provider.',
    core: false,
  },
};

const DEFAULTS: FeatureFlags = {
  auth: true,
  vendors: true,
  favorites: true,
  alerts: true,
  vendorTools: true,
  admin: true,
  profile: true,
  settings: true,
  notifications: true,
  payments: true,
};

function resolveFlags(): FeatureFlags {
  const resolved = { ...DEFAULTS };
  for (const id of FEATURE_IDS) {
    const override = RAW_FEATURE_OVERRIDES[id];
    if (typeof override === 'boolean') resolved[id] = override;
    // Core modules are always on regardless of overrides.
    if (FEATURE_MANIFESTS[id].core) resolved[id] = true;
  }
  return resolved;
}

export const Features: FeatureFlags = resolveFlags();

export function isFeatureEnabled(id: FeatureId): boolean {
  return Features[id];
}

/** List of enabled feature manifests, handy for settings/about screens. */
export function enabledFeatures(): FeatureManifest[] {
  return FEATURE_IDS.filter((id) => Features[id]).map((id) => FEATURE_MANIFESTS[id]);
}
