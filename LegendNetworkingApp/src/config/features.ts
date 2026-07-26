// src/config/features.ts
// The module registry. This is what makes UnjadedDigital a *template*:
// every optional feature is a flag, so an app built from this scaffold can
// include or exclude whole modules without deleting code.
//
// Flags are resolved once from `app.config.ts` -> Constants.extra.features
// (see env.ts). Read them via `isFeatureEnabled(...)` or the `Features`
// object; drive conditional navigation/UI off the result.

import { RAW_FEATURE_OVERRIDES } from './env';

export const FEATURE_IDS = [
  'auth',
  'contacts',
  'circles',
  'outreach',
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
      'Email/password, OAuth, magic link, password reset, email verification, and secure session storage.',
    core: true,
  },
  contacts: {
    id: 'contacts',
    title: 'Contacts & Grading',
    description:
      'Your contact graph: where you met, premises, interaction log, and rarity-tier relationship grades. Import from phone/CSV, export to CSV.',
    core: true,
  },
  circles: {
    id: 'circles',
    title: 'Circles of Influence',
    description:
      'Saved premise queries that surface the contacts who match — with pin/exclude control.',
    core: false,
  },
  outreach: {
    id: 'outreach',
    title: 'Bulk Outreach',
    description:
      'Reach a whole circle: individual text blasts, BCC email, and a working call list — every touch logged.',
    core: false,
  },
  profile: {
    id: 'profile',
    title: 'Profile Management',
    description: 'View/edit profile, avatar upload, account settings, delete account.',
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
    description: 'Stripe-backed subscription tiers with a pluggable payment provider.',
    core: false,
  },
};

const DEFAULTS: FeatureFlags = {
  auth: true,
  contacts: true,
  circles: true,
  outreach: true,
  profile: true,
  settings: true,
  notifications: true,
  payments: false,
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
