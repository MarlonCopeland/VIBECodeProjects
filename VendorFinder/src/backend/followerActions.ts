// src/backend/followerActions.ts
// Follower moderation (block / unblock / force-unfollow), shared by BOTH
// backends. The rules are pure bookkeeping over the vendor's blocked list and
// the favorites table — only the two data accessors differ per implementation,
// so the logic itself had no business being written twice.

import type { FavoritesApi, Vendor, VendorPatch } from './types';

export interface FollowerActionDeps {
  getVendor(vendorId: string): Promise<Vendor | null>;
  updateVendor(vendorId: string, patch: VendorPatch): Promise<Vendor>;
  removeFavorite(userId: string, vendorId: string): Promise<void>;
}

type FollowerActions = Pick<
  FavoritesApi,
  'blockFollower' | 'unblockFollower' | 'removeFollower'
>;

export function createFollowerActions(deps: FollowerActionDeps): FollowerActions {
  async function requireVendor(vendorId: string): Promise<Vendor> {
    const vendor = await deps.getVendor(vendorId);
    if (!vendor) throw new Error('Vendor not found');
    return vendor;
  }

  return {
    /** Block a user AND drop their existing follow, so they leave the list. */
    async blockFollower(vendorId, userId) {
      const vendor = await requireVendor(vendorId);
      const blocked = new Set(vendor.blockedUserIds || []);
      blocked.add(userId);
      await deps.updateVendor(vendorId, { blockedUserIds: [...blocked] });
      await deps.removeFavorite(userId, vendorId);
    },

    async unblockFollower(vendorId, userId) {
      const vendor = await requireVendor(vendorId);
      await deps.updateVendor(vendorId, {
        blockedUserIds: (vendor.blockedUserIds || []).filter((id) => id !== userId),
      });
    },

    /** Force an unfollow without blocking them from following again. */
    async removeFollower(vendorId, userId) {
      await deps.removeFavorite(userId, vendorId);
    },
  };
}
