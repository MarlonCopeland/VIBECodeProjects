// src/backend/vendorFilter.ts
// Vendor search + visibility rules, shared by BOTH backend implementations.
//
// The point of the Backend contract is that screens behave identically whichever
// implementation is live — so the rules deciding WHICH vendors a viewer sees
// belong in exactly one place. These were previously copy-pasted into
// localBackend and supabaseBackend, where search relevance could drift apart
// silently.
//
// Every clause is idempotent, so re-applying a filter is harmless: the Supabase
// backend pushes what it can into SQL and still runs the whole filter here.

import type { Vendor, VendorFilter } from './types';

/** Free-text match over name, type, description, and tags. */
function matchesQuery(vendor: Vendor, query: string): boolean {
  const q = query.toLowerCase();
  return (
    vendor.name.toLowerCase().includes(q) ||
    vendor.type.toLowerCase().includes(q) ||
    (vendor.description || '').toLowerCase().includes(q) ||
    (vendor.tags || []).some((t) => t.toLowerCase().includes(q))
  );
}

export function applyVendorFilter(vendors: Vendor[], filter: VendorFilter = {}): Vendor[] {
  const { viewerUserId, query, type, tag, openOnly } = filter;
  let result = vendors;

  // A vendor that blocked the viewer is invisible to them.
  if (viewerUserId) {
    result = result.filter((v) => !(v.blockedUserIds || []).includes(viewerUserId));
  }
  if (query) result = result.filter((v) => matchesQuery(v, query));
  if (type) result = result.filter((v) => v.type === type);
  if (tag) result = result.filter((v) => (v.tags || []).includes(tag));
  if (openOnly) result = result.filter((v) => v.isOpen);

  return result;
}
