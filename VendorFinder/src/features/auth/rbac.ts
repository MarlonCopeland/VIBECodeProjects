// src/features/auth/rbac.ts
// Single source of truth for what each role can do. Admins inherit everything.
// Vendor-owned actions additionally check ownership (resource.vendor.ownerId).

import type { AppUser, Vendor } from '../../backend/types';

export type PermissionAction =
  | 'view:vendors'
  | 'search:vendors'
  | 'favorite:vendor'
  | 'view:profile'
  | 'edit:own-profile'
  | 'view:alerts'
  | 'access:vendor-tools'
  | 'edit:own-vendor'
  | 'send:broadcast'
  | 'manage:followers'
  | 'manage:subscription'
  | 'access:admin'
  | 'impersonate'
  | 'list:users';

export interface PermissionResource {
  vendor?: Vendor | null;
}

export function checkPermission(
  user: AppUser | null,
  action: PermissionAction,
  resource: PermissionResource = {},
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;

  switch (action) {
    // User actions
    case 'view:vendors':
    case 'search:vendors':
    case 'favorite:vendor':
    case 'view:profile':
    case 'edit:own-profile':
    case 'view:alerts':
      return true;

    // Vendor-only actions (must own the vendor when one is supplied)
    case 'access:vendor-tools':
    case 'edit:own-vendor':
    case 'send:broadcast':
    case 'manage:followers':
    case 'manage:subscription':
      return user.role === 'vendor' && (!resource.vendor || resource.vendor.ownerId === user.id);

    // Admin-only actions
    case 'access:admin':
    case 'impersonate':
    case 'list:users':
      return false;

    default:
      return false;
  }
}
