// src/features/contacts/vcardMapping.ts
// vCard <-> Legend contacts: pure functions, ZERO react-native/expo imports,
// so it unit-tests in plain Node (same arrangement as csvMapping.ts; the
// line-level format lives in src/lib/vcard.ts).
//
// Import reads FN/N, NICKNAME, ORG, TITLE, TEL, EMAIL and NOTE from vCard
// 3.0 and 4.0 files (2.1 works too, minus QUOTED-PRINTABLE). Export writes
// vCard 3.0, the version every phone and mail client still accepts.
// Legend-only fields (where met, premises, favorite) have no standard vCard
// property, so they are not exported: CSV stays the lossless format, vCard is
// the "talk to other apps" format.
//
// Imported contacts are tagged source 'csv' (the "came from a file" bucket):
// the database's check constraint only allows manual/device/csv, and a new
// source value would need a migration for no behavioural gain.

import { escapeText, parseVCards, serializeVCard, splitUnescaped, unescapeText } from '../../lib/vcard';
import type { VCard, VCardProperty } from '../../lib/vcard';
import type { Contact, ContactInput } from './types';

export interface VCardImportResult {
  inputs: ContactInput[];
  errors: string[];
}

/** TYPE values that say nothing about *which* number/address it is. */
const NON_LABEL_TYPES = new Set(['PREF', 'VOICE', 'INTERNET', 'TEXT', 'X400', 'MSG']);

/** vCard TYPE -> Legend label. Anything unknown is lower-cased as-is. */
const TYPE_TO_LABEL: Record<string, string> = {
  CELL: 'mobile',
  MOBILE: 'mobile',
  IPHONE: 'mobile',
  HOME: 'home',
  WORK: 'work',
  FAX: 'fax',
  PAGER: 'pager',
  MAIN: 'main',
  OTHER: 'other',
};

/** Legend label -> vCard TYPE on export. Unknown labels become X- types
 * only if they're token-safe; otherwise no TYPE is written. */
const LABEL_TO_TYPE: Record<string, string> = {
  mobile: 'CELL',
  cell: 'CELL',
  home: 'HOME',
  work: 'WORK',
  fax: 'FAX',
  pager: 'PAGER',
  main: 'MAIN',
  other: 'OTHER',
};

function labelFor(prop: VCardProperty, fallback: string): string {
  const types = (prop.params.TYPE ?? []).map((t) => t.toUpperCase());
  for (const t of types) {
    if (NON_LABEL_TYPES.has(t)) continue;
    return TYPE_TO_LABEL[t] ?? t.replace(/^X-/, '').toLowerCase();
  }
  return fallback;
}

function first(card: VCard, name: string): VCardProperty | undefined {
  return card.properties.find((p) => p.name === name);
}

function textOf(card: VCard, name: string): string | undefined {
  const p = first(card, name);
  const v = p ? unescapeText(p.value).trim() : '';
  return v || undefined;
}

/** First component of a ';'-structured value (ORG = "Company;Unit"). */
function firstComponent(card: VCard, name: string): string | undefined {
  const p = first(card, name);
  if (!p) return undefined;
  const v = unescapeText(splitUnescaped(p.value, ';')[0] ?? '').trim();
  return v || undefined;
}

/** NICKNAME may be a comma list; Legend keeps one nickname. */
function nicknameOf(card: VCard): string | undefined {
  const p = first(card, 'NICKNAME');
  if (!p) return undefined;
  const v = unescapeText(splitUnescaped(p.value, ',')[0] ?? '').trim();
  return v || undefined;
}

function nameOf(card: VCard): { firstName: string; lastName: string } {
  const n = first(card, 'N');
  if (n) {
    // N = family;given;additional;prefixes;suffixes (each may be a list).
    const [family = '', given = ''] = splitUnescaped(n.value, ';').map((c) =>
      unescapeText(splitUnescaped(c, ',')[0] ?? '').trim(),
    );
    if (family || given) return { firstName: given, lastName: family };
  }
  // No usable N: split FN on the first space, as the phone-book import does
  // for single-field names.
  const fn = textOf(card, 'FN') ?? '';
  const space = fn.indexOf(' ');
  return space === -1
    ? { firstName: fn, lastName: '' }
    : { firstName: fn.slice(0, space).trim(), lastName: fn.slice(space + 1).trim() };
}

/** Strip a 4.0 `tel:` URI scheme and any `;ext=` style URI params. */
function telValue(raw: string): string {
  const v = unescapeText(raw).trim();
  return /^tel:/i.test(v) ? v.slice(4).split(';')[0]!.trim() : v;
}

function emailValue(raw: string): string {
  const v = unescapeText(raw).trim();
  return /^mailto:/i.test(v) ? v.slice(7).trim() : v;
}

/** Convert parsed cards into ContactInputs. Skip messages number cards
 * from 1 in file order. */
export function vcardsToContacts(cards: VCard[]): VCardImportResult {
  const inputs: ContactInput[] = [];
  const errors: string[] = [];
  cards.forEach((card, i) => {
    const { firstName, lastName } = nameOf(card);
    if (!firstName && !lastName) {
      errors.push(`Card ${i + 1}: no name — skipped.`);
      return;
    }
    inputs.push({
      firstName,
      lastName,
      nickname: nicknameOf(card),
      company: firstComponent(card, 'ORG'),
      title: textOf(card, 'TITLE'),
      phones: card.properties
        .filter((p) => p.name === 'TEL')
        .map((p) => ({ label: labelFor(p, 'mobile'), number: telValue(p.value) }))
        .filter((p) => p.number),
      emails: card.properties
        .filter((p) => p.name === 'EMAIL')
        .map((p) => ({ label: labelFor(p, 'other'), address: emailValue(p.value) }))
        .filter((e) => e.address),
      avatarUrl: null,
      whereMet: null,
      premises: [],
      notes: textOf(card, 'NOTE'),
      favorite: false,
      source: 'csv',
    });
  });
  return { inputs, errors };
}

/** One-shot: .vcf text -> ContactInputs. */
export function vcardToContacts(text: string): VCardImportResult {
  const cards = parseVCards(text);
  if (cards.length === 0) return { inputs: [], errors: ['No vCards found (expected BEGIN:VCARD … END:VCARD).'] };
  return vcardsToContacts(cards);
}

function typeParam(label: string): string {
  const key = label.trim().toLowerCase();
  const t = LABEL_TO_TYPE[key];
  if (t) return `;TYPE=${t}`;
  return /^[a-z0-9-]+$/.test(key) ? `;TYPE=X-${key.toUpperCase()}` : '';
}

/** Contacts -> one .vcf file (vCard 3.0, CRLF, folded at 75 octets). */
export function contactsToVcard(contacts: Pick<Contact, 'firstName' | 'lastName' | 'nickname' | 'company' | 'title' | 'phones' | 'emails' | 'notes'>[]): string {
  return contacts
    .map((c) => {
      const lines = ['VERSION:3.0'];
      lines.push(`N:${escapeText(c.lastName)};${escapeText(c.firstName)};;;`);
      lines.push(`FN:${escapeText([c.firstName, c.lastName].filter(Boolean).join(' '))}`);
      if (c.nickname) lines.push(`NICKNAME:${escapeText(c.nickname)}`);
      if (c.company) lines.push(`ORG:${escapeText(c.company)}`);
      if (c.title) lines.push(`TITLE:${escapeText(c.title)}`);
      for (const p of c.phones) lines.push(`TEL${typeParam(p.label)}:${escapeText(p.number)}`);
      for (const e of c.emails) lines.push(`EMAIL;TYPE=INTERNET${typeParam(e.label).replace(';TYPE=', ',')}:${escapeText(e.address)}`);
      if (c.notes) lines.push(`NOTE:${escapeText(c.notes)}`);
      return serializeVCard(lines);
    })
    .join('');
}
