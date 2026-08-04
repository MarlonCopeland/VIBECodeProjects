// src/features/contacts/csvMapping.ts
// The CSV field-mapping engine: pure functions, ZERO react-native/expo
// imports, so it unit-tests in plain Node (importExport.ts wraps these with
// the app's real UUID generator and re-exports for the UI).
//
// Legend's own exports auto-map 1:1; foreign CSVs (Google Contacts, Outlook,
// spreadsheets) get best-effort guesses the user can correct in the mapping
// step of app/(app)/contacts-import.tsx.

import type { ContactInput, Premise, PremiseKind } from './types';
import { PREMISE_KINDS } from './types';

export type IdGen = () => string;

/** Fallback premise-id generator for pure/Node contexts (tests). The app
 * passes expo-crypto's randomUUID through importExport.ts instead. */
const defaultIdGen: IdGen = () =>
  `prem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

export type CsvSingleField =
  | 'first_name'
  | 'last_name'
  | 'nickname'
  | 'company'
  | 'title'
  | 'where_met_place'
  | 'where_met_city'
  | 'where_met_note'
  | 'premises'
  | 'notes'
  | 'favorite';

export type CsvMultiField = 'phones' | 'emails';
export type CsvField = CsvSingleField | CsvMultiField;

export interface CsvFieldDef {
  id: CsvField;
  label: string;
  /** Multi fields can pull from several CSV columns (Phone 1, Phone 2, …). */
  multi: boolean;
  hint?: string;
}

export const CSV_FIELD_DEFS: readonly CsvFieldDef[] = [
  { id: 'first_name', label: 'First name', multi: false },
  { id: 'last_name', label: 'Last name', multi: false },
  { id: 'nickname', label: 'Nickname', multi: false },
  { id: 'company', label: 'Company', multi: false },
  { id: 'title', label: 'Title', multi: false },
  { id: 'phones', label: 'Phones', multi: true, hint: 'Map every phone column — each becomes a number on the contact.' },
  { id: 'emails', label: 'Emails', multi: true, hint: 'Map every email column.' },
  { id: 'where_met_place', label: 'Where met — place', multi: false },
  { id: 'where_met_city', label: 'Where met — city', multi: false },
  { id: 'where_met_note', label: 'Where met — note', multi: false },
  { id: 'premises', label: 'Premises', multi: false, hint: 'Legend format: kind:label:tag|tag entries joined by ;' },
  { id: 'notes', label: 'Notes', multi: false },
  { id: 'favorite', label: 'Favorite', multi: false },
] as const;

/** Column index per Legend field; -1 (or [] for multi) = not imported. */
export interface CsvMapping {
  first_name: number;
  last_name: number;
  nickname: number;
  company: number;
  title: number;
  phones: number[];
  emails: number[];
  where_met_place: number;
  where_met_city: number;
  where_met_note: number;
  premises: number;
  notes: number;
  favorite: number;
}

// ---------------------------------------------------------------------------
// Auto-guessing
// ---------------------------------------------------------------------------

/** Normalize a header for matching: lowercase, alphanumerics only. */
function norm(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Aliases per single field, most-canonical first (Legend's own header wins). */
const SINGLE_ALIASES: Record<CsvSingleField, string[]> = {
  first_name: ['firstname', 'first', 'givenname', 'fname'],
  last_name: ['lastname', 'last', 'surname', 'familyname', 'lname'],
  nickname: ['nickname', 'nick', 'alias'],
  company: ['company', 'organization', 'organisation', 'org', 'employer', 'companyname'],
  title: ['title', 'jobtitle', 'position', 'role'],
  where_met_place: ['wheremetplace', 'wheremet', 'metat', 'place'],
  where_met_city: ['wheremetcity', 'city'],
  where_met_note: ['wheremetnote'],
  premises: ['premises', 'premise'],
  notes: ['notes', 'note', 'comments', 'comment', 'description'],
  favorite: ['favorite', 'favourite', 'starred', 'fav'],
};

function isPhoneHeader(n: string): boolean {
  return n.includes('phone') || n.includes('mobile') || n.includes('cell') || n === 'tel' || n === 'telephone';
}

function isEmailHeader(n: string): boolean {
  return n.includes('email') || n === 'mail';
}

export function guessMapping(header: string[]): CsvMapping {
  const normed = header.map(norm);
  const used = new Set<number>();

  const mapping: CsvMapping = {
    first_name: -1,
    last_name: -1,
    nickname: -1,
    company: -1,
    title: -1,
    phones: [],
    emails: [],
    where_met_place: -1,
    where_met_city: -1,
    where_met_note: -1,
    premises: -1,
    notes: -1,
    favorite: -1,
  };

  // Singles first (exact alias match), so e.g. Legend's canonical columns
  // claim their spots before the substring-based phone/email sweep runs.
  for (const field of Object.keys(SINGLE_ALIASES) as CsvSingleField[]) {
    for (const alias of SINGLE_ALIASES[field]) {
      const idx = normed.findIndex((n, i) => n === alias && !used.has(i));
      if (idx !== -1) {
        mapping[field] = idx;
        used.add(idx);
        break;
      }
    }
  }

  // Multi sweep: every remaining column that smells like a phone/email.
  normed.forEach((n, i) => {
    if (used.has(i)) return;
    if (isPhoneHeader(n)) {
      mapping.phones.push(i);
      used.add(i);
    } else if (isEmailHeader(n)) {
      mapping.emails.push(i);
      used.add(i);
    }
  });

  return mapping;
}

// ---------------------------------------------------------------------------
// Cell parsers (moved verbatim from importExport.ts so both stay pure)
// ---------------------------------------------------------------------------

/** Parse Legend's packed "label:value;label:value" format. */
export function pairsIn(field: string): { label: string; value: string }[] {
  return field
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(':');
      if (idx === -1) return { label: 'other', value: entry };
      return { label: entry.slice(0, idx) || 'other', value: entry.slice(idx + 1) };
    })
    .filter((p) => p.value.trim() !== '');
}

/** Parse Legend's packed "kind:label:tag|tag;…" premises format. */
export function premisesIn(field: string, genId: IdGen = defaultIdGen): Premise[] {
  return field
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(':');
      const rawKind = parts[0]?.trim().toLowerCase() ?? '';
      const kind: PremiseKind = (PREMISE_KINDS as string[]).includes(rawKind)
        ? (rawKind as PremiseKind)
        : 'topic';
      const tagsPart = (parts.length >= 3 ? parts[parts.length - 1] : '') ?? '';
      const label = (parts.length >= 3 ? parts.slice(1, -1).join(':') : parts.slice(1).join(':')).trim();
      const tags = tagsPart
        .split('|')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      return { id: genId(), kind, label, tags };
    })
    .filter((p) => p.label !== '');
}

/**
 * Derive an entry label from a foreign column header: "Work Phone" -> work,
 * "Cell" -> cell, "Phone 1 - Value" -> (generic) fallback.
 */
function labelFromHeader(header: string, kind: 'phone' | 'email'): string {
  const cleaned = header
    .toLowerCase()
    .replace(/e-?mail|telephone|phone|tel|number|address|value|\d+/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim();
  if (cleaned) return cleaned.split(/\s+/)[0]!;
  return kind === 'phone' ? 'mobile' : 'other';
}

// ---------------------------------------------------------------------------
// Mapping-driven conversion
// ---------------------------------------------------------------------------

export interface CsvImportResult {
  inputs: ContactInput[];
  errors: string[];
}

const FAVORITE_TRUTHY = new Set(['true', '1', 'yes', 'y', 'x', '*', 'starred', '* starred']);

/**
 * Convert parsed CSV data rows into ContactInputs under a mapping.
 * `rows` excludes the header row; skip messages number rows as the user sees
 * them in the file (header = line 1, first data row = line 2).
 */
export function csvRowsToContacts(
  header: string[],
  rows: string[][],
  mapping: CsvMapping,
  genId: IdGen = defaultIdGen,
): CsvImportResult {
  const errors: string[] = [];
  const inputs: ContactInput[] = [];

  const cell = (row: string[], idx: number): string =>
    idx >= 0 ? (row[idx] ?? '').trim() : '';

  const collect = (row: string[], cols: number[], kind: 'phone' | 'email') => {
    const entries: { label: string; value: string }[] = [];
    for (const idx of cols) {
      const value = cell(row, idx);
      if (!value) continue;
      // Packed Legend cells ("mobile:+1555;work:+1444") keep their own labels;
      // plain foreign cells get a label derived from the column header.
      if (value.includes(';') || value.includes(':')) entries.push(...pairsIn(value));
      else entries.push({ label: labelFromHeader(header[idx] ?? '', kind), value });
    }
    return entries;
  };

  rows.forEach((row, n) => {
    const firstName = cell(row, mapping.first_name);
    const lastName = cell(row, mapping.last_name);
    if (!firstName && !lastName) {
      errors.push(`Row ${n + 2}: no name — skipped.`);
      return;
    }
    const place = cell(row, mapping.where_met_place);
    inputs.push({
      firstName,
      lastName,
      nickname: cell(row, mapping.nickname) || undefined,
      company: cell(row, mapping.company) || undefined,
      title: cell(row, mapping.title) || undefined,
      phones: collect(row, mapping.phones, 'phone').map((p) => ({ label: p.label, number: p.value })),
      emails: collect(row, mapping.emails, 'email').map((e) => ({ label: e.label, address: e.value })),
      avatarUrl: null,
      whereMet: place
        ? {
            placeName: place,
            city: cell(row, mapping.where_met_city) || undefined,
            note: cell(row, mapping.where_met_note) || undefined,
          }
        : null,
      premises: premisesIn(cell(row, mapping.premises), genId),
      notes: cell(row, mapping.notes) || undefined,
      favorite: FAVORITE_TRUTHY.has(cell(row, mapping.favorite).toLowerCase()),
      source: 'csv',
    });
  });

  return { inputs, errors };
}
