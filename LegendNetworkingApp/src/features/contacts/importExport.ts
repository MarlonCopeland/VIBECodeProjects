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
import type { Contact, ContactInput, Interaction, Premise, PremiseKind } from './types';
import { PREMISE_KINDS } from './types';

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
// CSV -> ContactInput
// ---------------------------------------------------------------------------

function pairsIn(field: string): { label: string; value: string }[] {
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

function premisesIn(field: string): Premise[] {
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
      return { id: Crypto.randomUUID(), kind, label, tags };
    })
    .filter((p) => p.label !== '');
}

export interface CsvImportResult {
  inputs: ContactInput[];
  errors: string[];
}

export function csvToContacts(text: string): CsvImportResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (rows.length === 0) return { inputs: [], errors: ['File is empty.'] };

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col('first_name') === -1 && col('last_name') === -1) {
    return { inputs: [], errors: ['Missing header row (expected at least first_name/last_name).'] };
  }

  const get = (row: string[], name: string) => {
    const i = col(name);
    return i === -1 ? '' : (row[i] ?? '').trim();
  };

  const inputs: ContactInput[] = [];
  rows.slice(1).forEach((row, n) => {
    const firstName = get(row, 'first_name');
    const lastName = get(row, 'last_name');
    if (!firstName && !lastName) {
      errors.push(`Row ${n + 2}: no name — skipped.`);
      return;
    }
    const place = get(row, 'where_met_place');
    inputs.push({
      firstName,
      lastName,
      nickname: get(row, 'nickname') || undefined,
      company: get(row, 'company') || undefined,
      title: get(row, 'title') || undefined,
      phones: pairsIn(get(row, 'phones')).map((p) => ({ label: p.label, number: p.value })),
      emails: pairsIn(get(row, 'emails')).map((e) => ({ label: e.label, address: e.value })),
      avatarUrl: null,
      whereMet: place
        ? {
            placeName: place,
            city: get(row, 'where_met_city') || undefined,
            note: get(row, 'where_met_note') || undefined,
          }
        : null,
      premises: premisesIn(get(row, 'premises')),
      notes: get(row, 'notes') || undefined,
      favorite: get(row, 'favorite').toLowerCase() === 'true',
      source: 'csv',
    });
  });
  return { inputs, errors };
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

export async function fetchDeviceContacts(): Promise<ContactInput[]> {
  if (Platform.OS === 'web') {
    throw new Error('Phone-book import is only available on iOS/Android. Use CSV import on web.');
  }
  const DeviceContacts = await import('expo-contacts');
  const { status } = await DeviceContacts.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Contacts permission was declined. Enable it in system settings to import.');
  }
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

  return data
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
  const FileSystem = await import('expo-file-system');
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
  const FileSystem = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, csvText);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: fileName });
  } else {
    throw new Error('Sharing is not available on this device.');
  }
}
