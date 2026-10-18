// src/features/contacts/knows.ts
// Knows Connections: "these two contacts know each other." Pure functions —
// the ContactsContext supplies the data, and both the mobile app and the
// desktop client (LegendDesktop/) render from the same resolution here.
//
// Links are STRONG by contact id. Each endpoint also carries a fingerprint
// (name + phone digits) captured when it was linked, so when a contact is
// deleted and later re-imported under a new id, the link isn't simply lost:
// resolveKnows() finds live contacts whose name and/or phone match the
// dangling endpoint and offers them as suggestions the user can accept
// (relink), which re-points the strong id.
//
// Match scoring: phone digits match = 2, normalized full-name match = 1, so a
// candidate matching on both (3) ranks above a phone-only (2) or a name-only
// (1) look-alike. Any score > 0 is suggested — the user always confirms.

import type { Contact, KnowsConnection, KnowsFingerprint, KnowsSide } from './types';

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Digits only, keeping the last 10 (the national number) so "+1 (555)
 * 123-4567" and "555.123.4567" compare equal. Fewer than 7 digits is too
 * weak to match on and normalizes to ''.
 */
export function normalizePhone(number: string): string {
  const digits = number.replace(/\D+/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-10);
}

export function displayNameOf(contact: Pick<Contact, 'firstName' | 'lastName' | 'nickname'>): string {
  return `${contact.firstName} ${contact.lastName}`.trim() || contact.nickname?.trim() || '';
}

export function fingerprintOf(contact: Contact): KnowsFingerprint {
  const phones = new Set<string>();
  for (const p of contact.phones) {
    const n = normalizePhone(p.number);
    if (n) phones.add(n);
  }
  return { name: displayNameOf(contact), phones: [...phones] };
}

export interface KnowsMatch {
  contact: Contact;
  score: number;
  nameMatch: boolean;
  phoneMatch: boolean;
}

/** How well a live contact matches a remembered fingerprint (score 0 = no). */
export function matchFingerprint(fp: KnowsFingerprint, contact: Contact): KnowsMatch {
  const fpName = normalizeName(fp.name);
  const nameMatch = fpName !== '' && fpName === normalizeName(displayNameOf(contact));
  const mine = fingerprintOf(contact).phones;
  const phoneMatch = fp.phones.length > 0 && mine.some((p) => fp.phones.includes(p));
  return { contact, score: (phoneMatch ? 2 : 0) + (nameMatch ? 1 : 0), nameMatch, phoneMatch };
}

/** "name + phone", "phone", "name" — why a suggestion was made. */
export function describeMatch(m: Pick<KnowsMatch, 'nameMatch' | 'phoneMatch'>): string {
  if (m.nameMatch && m.phoneMatch) return 'name + phone';
  return m.phoneMatch ? 'phone' : 'name';
}

export type ResolvedEndpoint =
  | { status: 'linked'; contact: Contact }
  /** The id no longer resolves; candidates are live look-alikes, best first. */
  | { status: 'missing'; fingerprint: KnowsFingerprint; candidates: KnowsMatch[] };

export interface ResolvedKnows {
  link: KnowsConnection;
  contact: ResolvedEndpoint;
  known: ResolvedEndpoint;
}

export function otherSide(side: KnowsSide): KnowsSide {
  return side === 'contact' ? 'known' : 'contact';
}

export function endpointId(link: KnowsConnection, side: KnowsSide): string {
  return side === 'contact' ? link.contactId : link.knownContactId;
}

export function endpointFingerprint(link: KnowsConnection, side: KnowsSide): KnowsFingerprint {
  return side === 'contact' ? link.contact : link.known;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** True when a and b are already linked (either direction). */
export function hasKnows(links: KnowsConnection[], a: string, b: string): boolean {
  const key = pairKey(a, b);
  return links.some((l) => pairKey(l.contactId, l.knownContactId) === key);
}

/**
 * Resolve every link's endpoints against the live contact list. A missing
 * endpoint gets candidate matches, excluding the link's other endpoint
 * (nobody knows themselves) and anyone already linked to that other
 * endpoint (accepting would just duplicate an existing link).
 */
export function resolveKnows(links: KnowsConnection[], contacts: Contact[]): ResolvedKnows[] {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const pairs = new Set(links.map((l) => pairKey(l.contactId, l.knownContactId)));

  const resolveSide = (link: KnowsConnection, side: KnowsSide): ResolvedEndpoint => {
    const live = byId.get(endpointId(link, side));
    if (live) return { status: 'linked', contact: live };
    const fingerprint = endpointFingerprint(link, side);
    const otherId = endpointId(link, otherSide(side));
    const candidates = contacts
      .filter((c) => c.id !== otherId && !pairs.has(pairKey(c.id, otherId)))
      .map((c) => matchFingerprint(fingerprint, c))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score || displayNameOf(a.contact).localeCompare(displayNameOf(b.contact)));
    return { status: 'missing', fingerprint, candidates };
  };

  return links.map((link) => ({
    link,
    contact: resolveSide(link, 'contact'),
    known: resolveSide(link, 'known'),
  }));
}

export interface KnowsLinked {
  link: KnowsConnection;
  other: Contact;
}

/**
 * One loose suggestion: `missingSide` of `link` no longer resolves, and
 * `candidate` looks like the person it used to point to. Accepting means
 * relinking `missingSide` to `candidate.contact.id`.
 */
export interface KnowsSuggestion {
  link: KnowsConnection;
  missingSide: KnowsSide;
  /** Who the dangling endpoint was. */
  was: KnowsFingerprint;
  /** The still-live endpoint on the other side. */
  anchor: Contact;
  candidate: KnowsMatch;
}

export interface KnowsLost {
  link: KnowsConnection;
  missingSide: KnowsSide;
  was: KnowsFingerprint;
}

export interface ContactKnows {
  /** Strong links: both endpoints are live contacts. */
  linked: KnowsLinked[];
  /** Loose matches that need the user's OK before they become strong. */
  suggested: KnowsSuggestion[];
  /** Links whose other person is gone with no look-alike to suggest. */
  lost: KnowsLost[];
}

/**
 * Everything the Knows section of `contactId`'s screen shows:
 *  - linked: this contact is an endpoint and the other one is live;
 *  - suggested: either this contact's other endpoint is gone but has
 *    look-alikes ("was Jane Doe — is it this Jane?"), OR this contact is
 *    itself the look-alike for someone else's dangling endpoint ("Bob knew a
 *    Jane Doe — is that you?");
 *  - lost: the other endpoint is gone and nothing resembles it.
 */
export function knowsForContact(contactId: string, resolved: ResolvedKnows[]): ContactKnows {
  const out: ContactKnows = { linked: [], suggested: [], lost: [] };

  for (const r of resolved) {
    const sides: KnowsSide[] = ['contact', 'known'];
    const mySide = sides.find((s) => {
      const ep = r[s];
      return ep.status === 'linked' && ep.contact.id === contactId;
    });

    if (mySide) {
      const theirs = otherSide(mySide);
      const ep = r[theirs];
      const anchor = (r[mySide] as { contact: Contact }).contact;
      if (ep.status === 'linked') {
        out.linked.push({ link: r.link, other: ep.contact });
      } else if (ep.candidates.length > 0) {
        for (const candidate of ep.candidates) {
          out.suggested.push({ link: r.link, missingSide: theirs, was: ep.fingerprint, anchor, candidate });
        }
      } else {
        out.lost.push({ link: r.link, missingSide: theirs, was: ep.fingerprint });
      }
      continue;
    }

    // Not an endpoint by id — am I the look-alike for a dangling endpoint
    // whose partner is still live?
    for (const side of sides) {
      const ep = r[side];
      const partner = r[otherSide(side)];
      if (ep.status !== 'missing' || partner.status !== 'linked') continue;
      const candidate = ep.candidates.find((m) => m.contact.id === contactId);
      if (candidate) {
        out.suggested.push({ link: r.link, missingSide: side, was: ep.fingerprint, anchor: partner.contact, candidate });
      }
    }
  }

  const byName = (a: Contact, b: Contact) => displayNameOf(a).localeCompare(displayNameOf(b));
  out.linked.sort((a, b) => byName(a.other, b.other));
  out.suggested.sort((a, b) => b.candidate.score - a.candidate.score || byName(a.anchor, b.anchor));
  return out;
}

export interface KnowsEdge {
  linkId: string;
  source: string;
  target: string;
}

/** Strong (both-live) links as undirected edges — feeds the network graph. */
export function knowsEdges(resolved: ResolvedKnows[]): KnowsEdge[] {
  const edges: KnowsEdge[] = [];
  for (const r of resolved) {
    if (r.contact.status === 'linked' && r.known.status === 'linked') {
      edges.push({ linkId: r.link.id, source: r.contact.contact.id, target: r.known.contact.id });
    }
  }
  return edges;
}

/** Count of suggestions network-wide (badge on the contacts list, etc.). */
export function countKnowsSuggestions(resolved: ResolvedKnows[]): number {
  let n = 0;
  for (const r of resolved) {
    const a = r.contact;
    const b = r.known;
    if (a.status === 'missing' && b.status === 'linked' && a.candidates.length > 0) n += 1;
    if (b.status === 'missing' && a.status === 'linked' && b.candidates.length > 0) n += 1;
  }
  return n;
}
