// src/features/vendorTools/index.ts
// Public surface + manifest for the Vendor Tools feature (vendor-role only):
// open toggle, schedule editing, quota-limited broadcasts, and follower/
// subscription management.

import { backend } from '../../backend';
import { FEATURE_MANIFESTS, isFeatureEnabled } from '../../config/features';
import type {
  AppUser,
  GeoPoint,
  ScheduleSlot,
  SendNotificationInput,
  SendNotificationResult,
  Vendor,
  VendorPatch,
  WeeklyUsage,
} from '../../backend/types';

export const vendorToolsService = {
  getByOwner: (ownerId: string): Promise<Vendor | null> => backend.vendors.getByOwner(ownerId),
  update: (id: string, patch: VendorPatch): Promise<Vendor> => backend.vendors.update(id, patch),

  /** Flip open status; when opening, snapshot the current location. */
  setOpen: (vendorId: string, isOpen: boolean, currentLocation?: GeoPoint | null): Promise<Vendor> =>
    backend.vendors.update(vendorId, {
      isOpen,
      ...(isOpen && currentLocation ? { currentLocation } : {}),
    }),

  setSchedule: (vendorId: string, schedule: ScheduleSlot[]): Promise<Vendor> =>
    backend.vendors.update(vendorId, { schedule }),

  send: (vendorId: string, input: SendNotificationInput): Promise<SendNotificationResult> =>
    backend.broadcasts.send(vendorId, input),

  weeklyUsage: (vendorId: string): Promise<WeeklyUsage> => backend.broadcasts.getWeeklyUsage(vendorId),

  listFollowers: (vendorId: string): Promise<AppUser[]> => backend.favorites.listFollowers(vendorId),
  blockFollower: (vendorId: string, userId: string): Promise<void> =>
    backend.favorites.blockFollower(vendorId, userId),
  unblockFollower: (vendorId: string, userId: string): Promise<void> =>
    backend.favorites.unblockFollower(vendorId, userId),
  removeFollower: (vendorId: string, userId: string): Promise<void> =>
    backend.favorites.removeFollower(vendorId, userId),
};

export const vendorToolsModule = {
  ...FEATURE_MANIFESTS.vendorTools,
  enabled: isFeatureEnabled('vendorTools'),
  routes: ['(app)/(tabs)/vendor-tools', '(app)/vendor/edit', '(app)/followers'],
} as const;
