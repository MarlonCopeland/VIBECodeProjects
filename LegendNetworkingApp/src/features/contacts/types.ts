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

export interface PhoneEntry {
  /** e.g. "mobile", "work" */
  label: string;
  number: string;
}

export interface EmailEntry {
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
