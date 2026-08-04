// src/backend/local/sql/seed.ts
// Legend originally shipped a demo network that was seeded on first launch.
// That demo is gone: new installs start empty. This module now performs a
// one-time cleanup that removes the demo contacts (and the demo circle) from
// installs that were already seeded before the demo was retired.
//
// It matches the demo contacts by the reserved phone numbers the old seed
// used, so a user's own manually created or CSV-imported contacts are never
// touched. Gated on a persisted `demo_purged` meta flag so it runs at most
// once, even after deleting-and-relaunching.

import type { ContactsApi } from '../../types';
import type { SqlDriver } from './types';
import { getMeta, setMeta } from './schema';

// One reserved number per retired demo contact — the fingerprint we match on.
const DEMO_PHONES = new Set([
  '+15551230001', '+15551230002', '+15551230003', '+15551230004',
  '+15551230005', '+15551230006', '+15551230007', '+15551230008',
  '+15551230009', '+15551230010', '+15551230011', '+15551230012',
]);

const DEMO_CIRCLE_NAME = 'Civic & Community';

export async function removeDemoDataIfNeeded(
  driver: SqlDriver,
  api: ContactsApi,
  ownerId: string,
): Promise<void> {
  if ((await getMeta(driver, 'demo_purged')) === 'true') return;
  // Mark first: if we crash mid-cleanup, we won't retry and risk deleting
  // real data the user has since added under a colliding phone number.
  await setMeta(driver, 'demo_purged', 'true');

  const contacts = await api.listContacts(ownerId);
  for (const c of contacts) {
    if (c.phones.some((p) => DEMO_PHONES.has(p.number))) {
      await api.deleteContact(ownerId, c.id); // also removes its interactions
    }
  }

  const circles = await api.listCircles(ownerId);
  for (const circle of circles) {
    if (circle.name === DEMO_CIRCLE_NAME) {
      await api.deleteCircle(ownerId, circle.id);
    }
  }
}
