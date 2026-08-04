// src/features/alerts/index.ts
// Public surface + manifest for the Location Alerts feature.

import { FEATURE_MANIFESTS, isFeatureEnabled } from '../../config/features';

export {
  notify,
  evaluateAndAlert,
  registerForPushNotifications,
  getAlertHistory,
  clearAlertHistory,
  resetAlertDedupe,
} from './alertService';
export type { AlertEntry, EvaluateInput } from './alertService';

export const alertsModule = {
  ...FEATURE_MANIFESTS.alerts,
  enabled: isFeatureEnabled('alerts'),
  routes: ['(app)/(tabs)/alerts'],
} as const;
