// src/features/auth/index.ts
// Public surface + module manifest for the Authentication & Security feature.
// This is a CORE module and is always enabled.

import { FEATURE_MANIFESTS } from '../../config/features';

export { AuthProvider, useAuth } from './AuthContext';
export type { AuthStatus } from './AuthContext';
export * as authService from './authService';
export type { SignUpParams, VendorInfo } from './authService';
export { checkPermission } from './rbac';
export type { PermissionAction, PermissionResource } from './rbac';
export { PasswordStrengthMeter } from './components/PasswordStrengthMeter';
export { SocialAuthButtons } from './components/SocialAuthButtons';

export const authModule = {
  ...FEATURE_MANIFESTS.auth,
  routes: ['(auth)/login', '(auth)/signup', '(auth)/forgot-password', '(auth)/verify-email'],
} as const;
