// src/features/favorites/index.ts
// Public surface + manifest for the Favorites & Following feature. The favorites
// state itself lives in VendorContext (so the list and the star stay in sync);
// this module exposes the thin service + follower-management helpers.

import { backend } from '../../backend';
import { FEATURE_MANIFESTS, isFeatureEnabled } from '../../config/features';
import type { AppUser } from '../../backend/types';

export const favoritesService = {
  list: (userId: string): Promise<string[]> => backend.favorites.list(userId),
  add: (userId: string, vendorId: string): Promise<void> => backend.favorites.add(userId, vendorId),
  remove: (userId: string, vendorId: string): Promise<void> =>
    backend.favorites.remove(userId, vendorId),
  listFollowers: (vendorId: string): Promise<AppUser[]> => backend.favorites.listFollowers(vendorId),
  blockFollower: (vendorId: string, userId: string): Promise<void> =>
    backend.favorites.blockFollower(vendorId, userId),
  unblockFollower: (vendorId: string, userId: string): Promise<void> =>
    backend.favorites.unblockFollower(vendorId, userId),
  removeFollower: (vendorId: string, userId: string): Promise<void> =>
    backend.favorites.removeFollower(vendorId, userId),
};

export const favoritesModule = {
  ...FEATURE_MANIFESTS.favorites,
  enabled: isFeatureEnabled('favorites'),
  routes: ['(app)/(tabs)/favorites'],
} as const;
