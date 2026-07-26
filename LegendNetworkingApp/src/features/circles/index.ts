// src/features/circles/index.ts
// Public surface + manifest for the Circles of Influence feature.

import { FEATURE_MANIFESTS, isFeatureEnabled } from '../../config/features';

export * from './circlesService';

export const circlesModule = {
  ...FEATURE_MANIFESTS.circles,
  enabled: isFeatureEnabled('circles'),
  routes: ['(app)/(tabs)/circles', '(app)/circle/[id]', '(app)/circle/edit'],
} as const;
