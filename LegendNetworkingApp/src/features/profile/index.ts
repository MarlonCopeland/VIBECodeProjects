// src/features/profile/index.ts
// Public surface + manifest for the Profile Management feature.

import { FEATURE_MANIFESTS } from '../../config/features';
import { isFeatureEnabled } from '../../config/features';

export * as profileService from './profileService';

export const profileModule = {
  ...FEATURE_MANIFESTS.profile,
  enabled: isFeatureEnabled('profile'),
  routes: ['(app)/profile/edit'],
} as const;
