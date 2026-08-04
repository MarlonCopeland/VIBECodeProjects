// src/features/vendors/vendorService.ts
// Thin wrapper over the vendor backend surface. Screens/contexts import these
// rather than the backend directly.

import { backend } from '../../backend';
import type {
  Vendor,
  VendorFilter,
  VendorPatch,
  VendorRegistration,
} from '../../backend/types';

export function listVendors(filter?: VendorFilter): Promise<Vendor[]> {
  return backend.vendors.list(filter);
}

export function getVendor(id: string): Promise<Vendor | null> {
  return backend.vendors.get(id);
}

export function getVendorByOwner(ownerId: string): Promise<Vendor | null> {
  return backend.vendors.getByOwner(ownerId);
}

export function registerVendor(data: VendorRegistration): Promise<Vendor> {
  return backend.vendors.register(data);
}

export function updateVendor(id: string, patch: VendorPatch): Promise<Vendor> {
  return backend.vendors.update(id, patch);
}

export function subscribeVendors(cb: (vendors: Vendor[]) => void): () => void {
  return backend.vendors.subscribe(cb);
}
