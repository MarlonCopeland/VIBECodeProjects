// src/features/admin/index.ts
// Public surface + manifest for the Admin Console feature. Impersonation state
// itself lives in AuthContext; this module exposes the user directory service
// and the impersonation banner.

import { backend } from '../../backend';
import { FEATURE_MANIFESTS, isFeatureEnabled } from '../../config/features';
import type { AppUser } from '../../backend/types';

export { ImpersonationBanner } from './components/ImpersonationBanner';

export const adminService = {
  listUsers: (): Promise<AppUser[]> => backend.users.list(),
  getUser: (id: string): Promise<AppUser | null> => backend.users.get(id),
};

export const adminModule = {
  ...FEATURE_MANIFESTS.admin,
  enabled: isFeatureEnabled('admin'),
  routes: ['(app)/(tabs)/admin'],
} as const;
