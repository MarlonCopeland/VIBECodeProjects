// src/features/contacts/types.ts
// Legend's domain model — the single home for contact/premise/interaction/
// circle types. The backend contract (src/backend/types.ts) re-exports these,
// so both backend implementations and all UI share exactly one definition.

/** Why you know each other: the structured context a contact was met under. */
export type PremiseKind = 'event' | 'topic' | 'expertise' | 'hobby' | 'interest' | 'place';

export const PREMISE_KINDS: PremiseKind[] = [
  'event',
  'topic',
  'expertise',
  'hobby',
  'interest',
  'place',
];

export interface Premise {
  id: string;
  kind: PremiseKind;
  /** e.g. "NAACP Gala 2026", "small-business lending", "chess" */
  label: string;
  /** Free-form lowercase tags used by circle matching. */
  tags: string[];
}

// Phone/email entries carry a stable `id` (Phase 8.2) so storage can merge
// them per item, like premises: editing one number on one device and adding
// another on a second device no longer clobbers either. The id is optional on
// purpose: entries that have never been stored (CSV / vCard / phone-book
// import, the seed, a fresh row in the edit form before save) may arrive
// without one and storage assigns it on first write. Every entry READ back
// from storage has one: the SQLite rows always had ids, they just weren't
// surfaced, so existing data needs no backfill.
export interface PhoneEntry {
  id?: string;
  /** e.g. "mobile", "work" */
  label: string;
  number: string;
}

export interface EmailEntry {
  id?: string;
  label: string;
  address: string;
}

export interface WhereMet {
  placeName: string;
  city?: string;
  note?: string;
}

export type ContactSource = 'manual' | 'device' | 'csv';

export interface Contact {
  id: string;
  ownerId: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  company?: string;
  title?: string;
  phones: PhoneEntry[];
  emails: EmailEntry[];
  avatarUrl: string | null;
  whereMet: WhereMet | null;
  premises: Premise[];
  notes?: string;
  favorite: boolean;
  source: ContactSource;
  createdAt: string;
  updatedAt: string;
}

/** Everything the user supplies; ids/ownership/timestamps are backend-set. */
export type ContactInput = Omit<Contact, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;
export type ContactPatch = Partial<ContactInput>;

/**
 * One touchpoint with a contact. The interaction log is the source of truth
 * for grading — grades are always computed from it, never stored.
 * 'premise' = engaged their premise (attended their event, shared a space,
 * talked their topic); 'note' = a lightweight "thought of them" entry.
 */
export type InteractionKind = 'call' | 'text' | 'email' | 'visit' | 'premise' | 'note';

export interface Interaction {
  id: string;
  contactId: string;
  kind: InteractionKind;
  occurredAt: string;
  note?: string;
  premiseId?: string;
}

export interface InteractionInput {
  contactId: string;
  kind: InteractionKind;
  /** Defaults to now. */
  occurredAt?: string;
  note?: string;
  premiseId?: string;
}

/** The filter a Circle of Influence is built from. */
export interface PremiseQuery {
  kinds: PremiseKind[];
  tags: string[];
  /** Free-text matched against premise labels, company, and title. */
  text?: string;
}

export interface Circle {
  id: string;
  ownerId: string;
  name: string;
  query: PremiseQuery;
  /** Always included, listed first. */
  pinnedContactIds: string[];
  /** Never included, even if they match. */
  excludedContactIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CircleInput {
  name: string;
  query: PremiseQuery;
  pinnedContactIds?: string[];
  excludedContactIds?: string[];
}

export type CirclePatch = Partial<CircleInput>;

/**
 * A snapshot of who an endpoint of a Knows Connection WAS when it was last
 * linked: display name + normalized phone digits. The contact id is the
 * strong link; this fingerprint is the loose fallback that lets a link
 * survive the contact being deleted and re-imported under a new id.
 */
export interface KnowsFingerprint {
  name: string;
  /** Digits only, last 10 (national number) — see knows.ts normalizePhone. */
  phones: string[];
}

/**
 * "These two people know each other." Added from one contact's Knows list,
 * but the relationship is mutual: it appears on both contacts. Stored once
 * per pair. Contact deletion deliberately does NOT remove the link — the
 * dangling endpoint keeps its fingerprint so a re-imported copy of that
 * person can be suggested as the match (see knows.ts resolveKnows).
 */
export interface KnowsConnection {
  id: string;
  ownerId: string;
  /** The contact the link was added from. */
  contactId: string;
  contact: KnowsFingerprint;
  /** The contact added to the list. */
  knownContactId: string;
  known: KnowsFingerprint;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** Which endpoint of a KnowsConnection. */
export type KnowsSide = 'contact' | 'known';
