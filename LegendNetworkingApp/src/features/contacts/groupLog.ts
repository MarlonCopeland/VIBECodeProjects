// src/features/contacts/groupLog.ts
// Group interaction logging: "I saw these 5 people at X event" becomes one
// action on the contact screen's logger ("Also with…") that writes the same
// interaction for every person. Pure functions, ZERO react-native/expo
// imports, so it unit-tests in plain Node. The screen feeds the result
// through the ordinary ContactsContext.logInteraction one by one, so grading,
// sync and history see exactly what a single log would produce.

import type { Contact, InteractionInput, InteractionKind } from './types';

export interface GroupLogFields {
  kind: InteractionKind;
  note?: string;
  /** One shared timestamp so the whole group reads as the same moment. */
  occurredAt: string;
}

/**
 * One InteractionInput per person: the primary contact first, then the
 * others in the order picked. Duplicate ids (and the primary repeated among
 * the others) are dropped, so a double tap never double-scores anyone. A
 * blank note is left out rather than stored as "".
 */
export function buildGroupInteractions(
  primaryId: string,
  otherIds: string[],
  fields: GroupLogFields,
): InteractionInput[] {
  const note = fields.note?.trim() || undefined;
  const ids: string[] = [];
  for (const id of [primaryId, ...otherIds]) {
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.map((contactId) => ({
    contactId,
    kind: fields.kind,
    occurredAt: fields.occurredAt,
    ...(note ? { note } : {}),
  }));
}

/**
 * Contacts for the "Also with…" picker: case-insensitive match on first,
 * last, full name or nickname; excluded ids (the primary contact and anyone
 * already picked) are left out. Prefix-of-a-word matches rank ahead of other
 * substring matches, then A-Z by full name. Empty query -> nothing.
 */
export function searchContactsForGroup(
  contacts: Pick<Contact, 'id' | 'firstName' | 'lastName' | 'nickname'>[],
  query: string,
  excludeIds: string[],
  limit = 6,
): Pick<Contact, 'id' | 'firstName' | 'lastName' | 'nickname'>[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const excluded = new Set(excludeIds);
  const fullName = (c: Pick<Contact, 'firstName' | 'lastName'>) => `${c.firstName} ${c.lastName}`.trim();
  return contacts
    .filter((c) => !excluded.has(c.id))
    .map((c) => {
      const hay = [fullName(c), c.nickname ?? ''].map((s) => s.toLowerCase());
      const words = hay.flatMap((s) => s.split(/\s+/));
      const rank = words.some((w) => w.startsWith(q)) || hay.some((s) => s.startsWith(q)) ? 0 : hay.some((s) => s.includes(q)) ? 1 : -1;
      return { c, rank, name: fullName(c).toLowerCase() };
    })
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((r) => r.c);
}
