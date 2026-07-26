// src/features/outreach/index.ts
// Public surface + manifest for the Bulk Outreach feature.

import { FEATURE_MANIFESTS, isFeatureEnabled } from '../../config/features';

export * from './outreachService';

export const outreachModule = {
  ...FEATURE_MANIFESTS.outreach,
  enabled: isFeatureEnabled('outreach'),
  routes: ['(app)/outreach/text', '(app)/outreach/email', '(app)/outreach/calls'],
} as const;
