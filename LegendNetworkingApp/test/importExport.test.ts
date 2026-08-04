// test/importExport.test.ts
// The CSV field-mapping engine (src/features/contacts/csvMapping.ts) — pure
// functions, no react-native/expo imports, so this runs in plain Node.

import { describe, expect, it } from 'vitest';
import {
  CSV_FIELD_DEFS,
  csvRowsToContacts,
  guessMapping,
  pairsIn,
} from '../src/features/contacts/csvMapping';
import { parseCsv } from '../src/lib/csv';

const LEGEND_HEADER = [
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

describe('guessMapping', () => {
  it('maps Legend’s own export header 1:1', () => {
    const m = guessMapping(LEGEND_HEADER);
    expect(m.first_name).toBe(0);
    expect(m.last_name).toBe(1);
    expect(m.nickname).toBe(2);
    expect(m.company).toBe(3);
    expect(m.title).toBe(4);
    expect(m.phones).toEqual([5]);
    expect(m.emails).toEqual([6]);
    expect(m.where_met_place).toBe(7);
    expect(m.where_met_city).toBe(8);
    expect(m.where_met_note).toBe(9);
    expect(m.premises).toBe(10);
    expect(m.notes).toBe(11);
    expect(m.favorite).toBe(12);
  });

  it('maps a Google-Contacts-style header, collecting every phone/email column', () => {
    const m = guessMapping([
      'Given Name',
      'Family Name',
      'Organization 1 - Name', // no alias — unmapped is fine
      'Phone 1 - Value',
      'Phone 2 - Value',
      'E-mail 1 - Value',
      'Notes',
    ]);
    expect(m.first_name).toBe(0);
    expect(m.last_name).toBe(1);
    expect(m.phones).toEqual([3, 4]);
    expect(m.emails).toEqual([5]);
    expect(m.notes).toBe(6);
  });

  it('leaves unknown columns unmapped', () => {
    const m = guessMapping(['Frobnicator', 'Wibble']);
    expect(m.first_name).toBe(-1);
    expect(m.phones).toEqual([]);
  });

  it('has a field definition for every mapping key', () => {
    const m = guessMapping([]);
    expect(new Set(Object.keys(m))).toEqual(new Set(CSV_FIELD_DEFS.map((d) => d.id)));
  });
});

describe('csvRowsToContacts', () => {
  it('imports plain foreign cells with header-derived labels', () => {
    const header = ['First', 'Last', 'Work Phone', 'Cell', 'Email'];
    const rows = [['Ada', 'Lovelace', '+15550001', '+15550002', 'ada@analytical.engine']];
    const { inputs, errors } = csvRowsToContacts(header, rows, guessMapping(header));
    expect(errors).toEqual([]);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.phones).toEqual([
      { label: 'work', number: '+15550001' },
      { label: 'cell', number: '+15550002' },
    ]);
    expect(inputs[0]!.emails).toEqual([{ label: 'other', address: 'ada@analytical.engine' }]);
  });

  it('still parses Legend’s packed label:value;… cells', () => {
    const header = ['first_name', 'last_name', 'phones'];
    const rows = [['Grace', 'Hopper', 'mobile:+15551111;work:+15552222']];
    const { inputs } = csvRowsToContacts(header, rows, guessMapping(header));
    expect(inputs[0]!.phones).toEqual([
      { label: 'mobile', number: '+15551111' },
      { label: 'work', number: '+15552222' },
    ]);
  });

  it('skips nameless rows with a line-numbered message', () => {
    const header = ['first_name', 'last_name'];
    const rows = [
      ['', ''],
      ['Jean', 'Bartik'],
    ];
    const { inputs, errors } = csvRowsToContacts(header, rows, guessMapping(header));
    expect(inputs).toHaveLength(1);
    expect(errors).toEqual(['Row 2: no name — skipped.']);
  });

  it('accepts common favorite spellings including Google’s starred', () => {
    const header = ['first_name', 'favorite'];
    const mk = (v: string) =>
      csvRowsToContacts(header, [['A', v]], guessMapping(header)).inputs[0]!.favorite;
    expect(mk('true')).toBe(true);
    expect(mk('TRUE')).toBe(true);
    expect(mk('* starred')).toBe(true);
    expect(mk('yes')).toBe(true);
    expect(mk('')).toBe(false);
    expect(mk('no')).toBe(false);
  });

  it('unmapped fields come through empty', () => {
    const header = ['first_name'];
    const { inputs } = csvRowsToContacts(header, [['Solo']], guessMapping(header));
    expect(inputs[0]!.lastName).toBe('');
    expect(inputs[0]!.phones).toEqual([]);
    expect(inputs[0]!.whereMet).toBeNull();
    expect(inputs[0]!.premises).toEqual([]);
  });

  it('round-trips through the real CSV parser', () => {
    const text =
      'Given Name,Family Name,Phone 1 - Value\r\n' +
      '"Katherine","Johnson","+1 555 867 5309"\r\n';
    const all = parseCsv(text);
    const header = all[0]!;
    const { inputs } = csvRowsToContacts(header, all.slice(1), guessMapping(header));
    expect(inputs[0]!.firstName).toBe('Katherine');
    expect(inputs[0]!.phones[0]!.number).toBe('+1 555 867 5309');
  });
});

describe('pairsIn', () => {
  it('parses labeled pairs and defaults bare values to other', () => {
    expect(pairsIn('mobile:+1555;+1444')).toEqual([
      { label: 'mobile', value: '+1555' },
      { label: 'other', value: '+1444' },
    ]);
  });
});
