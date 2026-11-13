// src/features/contacts/contactMerge.ts
// Merging two duplicate contacts into one. Pure functions, ZERO
// react-native/expo imports, so it unit-tests in plain Node; the storage
// step (repoint interactions, write the merged contact, tombstone the
// duplicate so sync sees the delete) lives in sqliteContacts.mergeContacts.
//
// Phones/emails match on the SAME normalisation the import dedupe uses
// (normalizePhone / normalizeEmail, which live here now and are re-exported
// from importExport.ts), so "what import calls a duplicate" and "what merge
// collapses" can't drift apart.

import type { Contact, ContactInput, Premise } from './types';

export function normalizePhone(number: string): string {
  const digits = number.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeEmail(address: string): string {
  return address.trim().toLowerCase();
}

function premiseKey(p: Pick<Premise, 'kind' | 'label'>): string {
  return `${p.kind}:${p.label.trim().toLowerCase()}`;
}

export interface MergeResult {
  /** Everything to write onto `keep` (ids of keep's own entries preserved;
   * entries brought over from `drop` carry no id / a fresh premise id). */
  merged: ContactInput;
  /** Earliest of the two creation times. */
  createdAt: string;
  /** drop's premise ids -> the premise id they now live under on keep, for
   * repointing interactions' premiseId. */
  premiseIdMap: Record<string, string>;
}

/**
 * Merge `drop` into `keep`. keep wins every single-value field it has filled;
 * drop fills the blanks. Phones/emails/premises are unioned (keep's first, by
 * normalised value / kind+label; matched premises union their tags), notes
 * are concatenated, favorite is either, createdAt is the earliest.
 * `genId` makes ids for premises copied from drop: reusing drop's ids would
 * collide with drop's (soon tombstoned) rows.
 */
export function mergeContacts(keep: Contact, drop: Contact, genId: () => string): MergeResult {
  const phones = [...keep.phones];
  const seenPhones = new Set(keep.phones.map((p) => normalizePhone(p.number)));
  for (const p of drop.phones) {
    const key = normalizePhone(p.number);
    if (!key || seenPhones.has(key)) continue;
    seenPhones.add(key);
    phones.push({ label: p.label, number: p.number });
  }

  const emails = [...keep.emails];
  const seenEmails = new Set(keep.emails.map((e) => normalizeEmail(e.address)));
  for (const e of drop.emails) {
    const key = normalizeEmail(e.address);
    if (!key || seenEmails.has(key)) continue;
    seenEmails.add(key);
    emails.push({ label: e.label, address: e.address });
  }

  const premises: Premise[] = keep.premises.map((p) => ({ ...p, tags: [...p.tags] }));
  const premiseIdMap: Record<string, string> = {};
  for (const p of drop.premises) {
    const match = premises.find((k) => premiseKey(k) === premiseKey(p));
    if (match) {
      for (const t of p.tags) if (!match.tags.includes(t)) match.tags.push(t);
      premiseIdMap[p.id] = match.id;
    } else {
      const id = genId();
      premises.push({ id, kind: p.kind, label: p.label, tags: [...p.tags] });
      premiseIdMap[p.id] = id;
    }
  }

  const notes = [keep.notes?.trim(), drop.notes?.trim()].filter(Boolean);
  const uniqueNotes = notes.filter((n, i) => notes.indexOf(n) === i);

  return {
    merged: {
      firstName: keep.firstName || drop.firstName,
      lastName: keep.lastName || drop.lastName,
      nickname: keep.nickname || drop.nickname,
      company: keep.company || drop.company,
      title: keep.title || drop.title,
      phones,
      emails,
      avatarUrl: keep.avatarUrl ?? drop.avatarUrl,
      whereMet: keep.whereMet ?? drop.whereMet,
      premises,
      notes: uniqueNotes.length ? uniqueNotes.join('\n\n') : undefined,
      favorite: keep.favorite || drop.favorite,
      source: keep.source,
    },
    createdAt: keep.createdAt <= drop.createdAt ? keep.createdAt : drop.createdAt,
    premiseIdMap,
  };
}
