// src/features/contacts/importExport.ts
// User-ownership plumbing: phone-book import, CSV import, CSV export.
// CSV schema (import and export share it — see TASKS.md):
//   first_name,last_name,nickname,company,title,phones,emails,
//   where_met_place,where_met_city,where_met_note,premises,notes,favorite
//   phones/emails: "label:value" pairs joined by ";"
//   premises:      "kind:label:tag|tag" entries joined by ";"

import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { parseCsv, serializeCsv } from '../../lib/csv';
import type { Contact, ContactInput, Interaction, Premise } from './types';
import {
  csvRowsToContacts as mapRowsToContacts,
  guessMapping,
  type CsvImportResult,
  type CsvMapping,
} from './csvMapping';

// Mapping engine (pure, Node-testable) lives in ./csvMapping — re-exported
// here so screens have one import site for all CSV import/export concerns.
export {
  CSV_FIELD_DEFS,
  guessMapping,
  type CsvField,
  type CsvFieldDef,
  type CsvImportResult,
  type CsvMapping,
  type CsvMultiField,
  type CsvSingleField,
} from './csvMapping';

export const CSV_HEADER = [
  'first_name',
  'last_name',
  'nickname',
  'company',
  'title',
  'phones',
  'emails',
  'where_met_place',
  'where_met_city',
  'where_met_note',
  'premises',
  'notes',
  'favorite',
];

// ---------------------------------------------------------------------------
// Contact -> CSV
// ---------------------------------------------------------------------------

function pairsOut(entries: { label: string; value: string }[]): string {
  return entries.map((e) => `${e.label}:${e.value}`).join(';');
}

function premisesOut(premises: Premise[]): string {
  return premises.map((p) => `${p.kind}:${p.label}:${p.tags.join('|')}`).join(';');
}

export function contactsToCsv(contacts: Contact[]): string {
  const rows = [CSV_HEADER];
  for (const c of contacts) {
    rows.push([
      c.firstName,
      c.lastName,
      c.nickname ?? '',
      c.company ?? '',
      c.title ?? '',
      pairsOut(c.phones.map((p) => ({ label: p.label, value: p.number }))),
      pairsOut(c.emails.map((e) => ({ label: e.label, value: e.address }))),
      c.whereMet?.placeName ?? '',
      c.whereMet?.city ?? '',
      c.whereMet?.note ?? '',
      premisesOut(c.premises),
      c.notes ?? '',
      c.favorite ? 'true' : 'false',
    ]);
  }
  return serializeCsv(rows);
}

export function interactionsToCsv(contacts: Contact[], interactions: Interaction[]): string {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const rows = [['contact_first', 'contact_last', 'kind', 'occurred_at', 'note']];
  for (const i of interactions) {
    const c = byId.get(i.contactId);
    if (!c) continue;
    rows.push([c.firstName, c.lastName, i.kind, i.occurredAt, i.note ?? '']);
  }
  return serializeCsv(rows);
}

// ---------------------------------------------------------------------------
// CSV -> ContactInput (mapping-driven; engine in ./csvMapping)
// ---------------------------------------------------------------------------

/** Parse a CSV into its header + data rows (null when the file is empty). */
export function parseCsvTable(text: string): { header: string[]; rows: string[][] } | null {
  const all = parseCsv(text);
  if (all.length === 0) return null;
  return { header: all[0]!.map((h) => h.trim()), rows: all.slice(1) };
}

/** Mapping-driven conversion with the app's real UUID generator bound in. */
export function csvRowsToContacts(
  header: string[],
  rows: string[][],
  mapping: CsvMapping,
): CsvImportResult {
  return mapRowsToContacts(header, rows, mapping, () => Crypto.randomUUID());
}

/** One-shot conversion using auto-guessed mappings (Legend's own format). */
export function csvToContacts(text: string): CsvImportResult {
  const table = parseCsvTable(text);
  if (!table) return { inputs: [], errors: ['File is empty.'] };
  const mapping = guessMapping(table.header);
  if (mapping.first_name === -1 && mapping.last_name === -1) {
    return { inputs: [], errors: ['Missing header row (expected at least first_name/last_name).'] };
  }
  return csvRowsToContacts(table.header, table.rows, mapping);
}

// ---------------------------------------------------------------------------
// Dedupe (device + CSV import share it)
// ---------------------------------------------------------------------------

export function normalizePhone(number: string): string {
  const digits = number.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeEmail(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Split candidates into new vs. already-present, matching on any shared
 * normalized phone/email, or exact full-name match as a last resort.
 */
export function dedupeAgainst(
  existing: Contact[],
  candidates: ContactInput[],
): { fresh: ContactInput[]; duplicates: ContactInput[] } {
  const phones = new Set<string>();
  const emails = new Set<string>();
  const names = new Set<string>();
  for (const c of existing) {
    for (const p of c.phones) {
      const n = normalizePhone(p.number);
      if (n) phones.add(n);
    }
    for (const e of c.emails) emails.add(normalizeEmail(e.address));
    names.add(`${c.firstName} ${c.lastName}`.trim().toLowerCase());
  }

  const fresh: ContactInput[] = [];
  const duplicates: ContactInput[] = [];
  for (const cand of candidates) {
    const dup =
      cand.phones.some((p) => {
        const n = normalizePhone(p.number);
        return n !== '' && phones.has(n);
      }) ||
      cand.emails.some((e) => emails.has(normalizeEmail(e.address))) ||
      (names.has(`${cand.firstName} ${cand.lastName}`.trim().toLowerCase()) &&
        `${cand.firstName}${cand.lastName}`.trim() !== '');
    (dup ? duplicates : fresh).push(cand);
    if (!dup) {
      // Also guard against duplicates *within* the import batch.
      for (const p of cand.phones) {
        const n = normalizePhone(p.number);
        if (n) phones.add(n);
      }
      for (const e of cand.emails) emails.add(normalizeEmail(e.address));
      names.add(`${cand.firstName} ${cand.lastName}`.trim().toLowerCase());
    }
  }
  return { fresh, duplicates };
}

// ---------------------------------------------------------------------------
// Device phone book -> ContactInput (expo-contacts)
// ---------------------------------------------------------------------------

/**
 * How much of the phone book the OS is actually sharing. iOS 18 added
 * `'limited'`: the user hand-picks contacts, and the app sees ONLY those —
 * possibly none at all — while the permission still reports as granted.
 */
export type ContactsAccess = 'all' | 'limited' | 'none' | 'unknown';

export interface DeviceContactsResult {
  inputs: ContactInput[];
  access: ContactsAccess;
  /** How many contacts the OS handed over, before name filtering. */
  sharedCount: number;
}

/**
 * Reopen iOS's "select contacts" sheet so the user can widen a limited grant.
 * Returns false when unavailable (Android, or iOS below 18, where the
 * underlying promise rejects immediately) so callers can fall back to
 * pointing at system settings.
 */
export async function presentContactAccessPicker(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const DeviceContacts = await import('expo-contacts');
    await DeviceContacts.presentAccessPickerAsync();
    return true;
  } catch {
    return false;
  }
}

export async function fetchDeviceContacts(): Promise<DeviceContactsResult> {
  if (Platform.OS === 'web') {
    throw new Error('Phone-book import is only available on iOS/Android. Use CSV import on web.');
  }
  const DeviceContacts = await import('expo-contacts');
  const permission = await DeviceContacts.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Contacts permission was declined. Enable it in system settings to import.');
  }
  // NOTE: on iOS 18 a "limited" grant is still `granted`, so an empty result
  // here means "you shared nothing", not "your phone book is empty". The
  // caller needs that distinction to offer a real retry.
  const access: ContactsAccess = permission.accessPrivileges ?? 'unknown';
  const { data } = await DeviceContacts.getContactsAsync({
    fields: [
      DeviceContacts.Fields.FirstName,
      DeviceContacts.Fields.LastName,
      DeviceContacts.Fields.Company,
      DeviceContacts.Fields.JobTitle,
      DeviceContacts.Fields.PhoneNumbers,
      DeviceContacts.Fields.Emails,
    ],
  });

  const inputs = data
    .filter((d) => (d.firstName ?? d.lastName ?? d.name ?? '').trim() !== '')
    .map<ContactInput>((d) => ({
      firstName: (d.firstName ?? d.name ?? '').trim(),
      lastName: (d.lastName ?? '').trim(),
      company: d.company?.trim() || undefined,
      title: d.jobTitle?.trim() || undefined,
      phones: (d.phoneNumbers ?? [])
        .filter((p) => (p.number ?? '').trim() !== '')
        .map((p) => ({ label: p.label ?? 'mobile', number: (p.number ?? '').trim() })),
      emails: (d.emails ?? [])
        .filter((e) => (e.email ?? '').trim() !== '')
        .map((e) => ({ label: e.label ?? 'home', address: (e.email ?? '').trim() })),
      avatarUrl: null,
      whereMet: null,
      premises: [],
      favorite: false,
      source: 'device',
    }));

  return { inputs, access, sharedCount: data.length };
}

// ---------------------------------------------------------------------------
// File pick / share
// ---------------------------------------------------------------------------

/** Open a file picker and return the chosen CSV's text (null if canceled). */
export async function pickCsvText(): Promise<string | null> {
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const uri = result.assets[0]!.uri;
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return res.text();
  }
  const FileSystem = await import('expo-file-system/legacy');
  return FileSystem.readAsStringAsync(uri);
}

/** Write CSV text to a file and open the platform share sheet (web: download). */
export async function shareCsv(fileName: string, csvText: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([csvText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, csvText);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: fileName });
  } else {
    throw new Error('Sharing is not available on this device.');
  }
}
