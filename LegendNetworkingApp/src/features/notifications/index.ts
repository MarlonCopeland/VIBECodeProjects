// src/features/notifications/index.ts
// Public surface + manifest for the Push Notifications feature.

import { FEATURE_MANIFESTS, isFeatureEnabled } from '../../config/features';

export * as notificationService from './notificationService';

export const notificationsModule = {
  ...FEATURE_MANIFESTS.notifications,
  enabled: isFeatureEnabled('notifications'),
  routes: [] as const,
} as const;
