// src/features/vendors/index.ts
// Public surface + manifest for the Vendor Discovery feature. This is a CORE
// module (the app's whole purpose) and is always enabled.

import { FEATURE_MANIFESTS } from '../../config/features';

export { VendorProvider, useVendors } from './VendorContext';
export * as vendorService from './vendorService';
export { VendorCard } from './components/VendorCard';
export { SearchBar } from './components/SearchBar';
export { ScheduleItem } from './components/ScheduleItem';

export const VENDOR_TYPES = [
  'Food',
  'Clothes',
  'Activity',
  'Electronics',
  'Arts',
  'Services',
  'Other',
] as const;

export const vendorsModule = {
  ...FEATURE_MANIFESTS.vendors,
  routes: ['(app)/(tabs)/index', '(app)/(tabs)/search', '(app)/vendor/[id]'],
} as const;
