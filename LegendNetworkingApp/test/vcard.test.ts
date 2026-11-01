// test/vcard.test.ts
// vCard import/export: the line-level format (src/lib/vcard.ts) and the
// Contact mapping (src/features/contacts/vcardMapping.ts). Both are pure, no
// react-native/expo imports, so this runs in plain Node.

import { describe, expect, it } from 'vitest';
import {
  escapeText,
  foldLine,
  parsePropertyLine,
  parseVCards,
  unescapeText,
  unfoldLines,
} from '../src/lib/vcard';
import { contactsToVcard, vcardToContacts } from '../src/features/contacts/vcardMapping';

const CRLF = '\r\n';

describe('vcard line format', () => {
  it('unfolds continuation lines (space or tab) with CRLF or LF', () => {
    expect(unfoldLines('NOTE:hello\r\n  world\r\nFN:A')).toEqual(['NOTE:hello world', 'FN:A']);
    expect(unfoldLines('NOTE:ab\n\tcd')).toEqual(['NOTE:abcd']);
  });

  it('unescapes and escapes text values', () => {
    expect(unescapeText('a\\, b\\; c\\\\d\\ne\\Nf')).toBe('a, b; c\\d\ne\nf');
    expect(escapeText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
    expect(unescapeText(escapeText('x,y;z\\\nq'))).toBe('x,y;z\\\nq');
  });

  it('splits group, name, 3.0 / 4.0 / 2.1 style params, and value', () => {
    const a = parsePropertyLine('item1.TEL;TYPE=CELL;TYPE=VOICE:+1 555 0100')!;
    expect(a.name).toBe('TEL');
    expect(a.params.TYPE).toEqual(['CELL', 'VOICE']);
    expect(a.value).toBe('+1 555 0100');

    const b = parsePropertyLine('tel;type="cell,voice";pref=1;value=uri:tel:+1-555-0101')!;
    expect(b.name).toBe('TEL');
    expect(b.params.TYPE).toEqual(['cell', 'voice']);
    expect(b.params.PREF).toEqual(['1']);
    expect(b.value).toBe('tel:+1-555-0101');

    const c = parsePropertyLine('TEL;WORK;FAX:555')!;
    expect(c.params.TYPE).toEqual(['WORK', 'FAX']);
    expect(parsePropertyLine('no colon here')).toBeNull();
  });

  it('folds long lines at 75 octets without splitting characters', () => {
    const line = 'NOTE:' + 'é'.repeat(100);
    const folded = foldLine(line);
    const physical = folded.split(CRLF);
    expect(physical.length).toBeGreaterThan(1);
    for (const p of physical) expect(Buffer.byteLength(p, 'utf8')).toBeLessThanOrEqual(75);
    expect(unfoldLines(folded)).toEqual([line]);
  });

  it('finds every card in a file and keeps an unterminated last one', () => {
    const text = 'BEGIN:VCARD\nFN:A\nEND:VCARD\njunk\nBEGIN:VCARD\nFN:B\nEND:VCARD\nBEGIN:VCARD\nFN:C\n';
    expect(parseVCards(text).map((c) => c.properties[0]!.value)).toEqual(['A', 'B', 'C']);
  });
});

describe('vcardToContacts', () => {
  it('maps a vCard 3.0 card (Apple style) with folding and escapes', () => {
    const text = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Lovelace;Ada;Augusta;;',
      'FN:Ada Lovelace',
      'NICKNAME:Countess,Ada',
      'ORG:Analytical Engines\\, Ltd;Research',
      'TITLE:Chief Programmer',
      'item1.TEL;type=CELL;type=VOICE;type=pref:+44 20 7946 0001',
      'TEL;TYPE=WORK:+44 20 7946 0002',
      'EMAIL;type=INTERNET;type=HOME;type=pref:ada@example.com',
      'NOTE:Met at the Babbage salon\\; loves poetry\\nSecond line, lo',
      ' ng note',
      'END:VCARD',
      '',
    ].join(CRLF);
    const { inputs, errors } = vcardToContacts(text);
    expect(errors).toEqual([]);
    expect(inputs).toHaveLength(1);
    const c = inputs[0]!;
    expect(c.firstName).toBe('Ada');
    expect(c.lastName).toBe('Lovelace');
    expect(c.nickname).toBe('Countess');
    expect(c.company).toBe('Analytical Engines, Ltd');
    expect(c.title).toBe('Chief Programmer');
    expect(c.phones).toEqual([
      { label: 'mobile', number: '+44 20 7946 0001' },
      { label: 'work', number: '+44 20 7946 0002' },
    ]);
    expect(c.emails).toEqual([{ label: 'home', address: 'ada@example.com' }]);
    expect(c.notes).toBe('Met at the Babbage salon; loves poetry\nSecond line, long note');
    expect(c.source).toBe('csv');
    expect(c.favorite).toBe(false);
    expect(c.premises).toEqual([]);
  });

  it('maps a vCard 4.0 card with tel: URIs and quoted TYPE lists', () => {
    const text = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:Grace Hopper',
      'TEL;VALUE=uri;TYPE="voice,cell";PREF=1:tel:+1-202-555-0199;ext=7',
      'EMAIL;TYPE=work:mailto:grace@navy.example',
      'END:VCARD',
    ].join(CRLF);
    const c = vcardToContacts(text).inputs[0]!;
    // No N property: FN splits on the first space.
    expect(c.firstName).toBe('Grace');
    expect(c.lastName).toBe('Hopper');
    expect(c.phones).toEqual([{ label: 'mobile', number: '+1-202-555-0199' }]);
    expect(c.emails).toEqual([{ label: 'work', address: 'grace@navy.example' }]);
  });

  it('reads multiple cards, defaults labels, and skips nameless cards', () => {
    const text = [
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Cher', 'TEL:555-0100', 'EMAIL:cher@example.com', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'TEL:555-0101', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'N:;Bo;;;', 'END:VCARD',
    ].join('\n');
    const { inputs, errors } = vcardToContacts(text);
    expect(inputs.map((c) => [c.firstName, c.lastName])).toEqual([
      ['Cher', ''],
      ['Bo', ''],
    ]);
    expect(inputs[0]!.phones).toEqual([{ label: 'mobile', number: '555-0100' }]);
    expect(inputs[0]!.emails).toEqual([{ label: 'other', address: 'cher@example.com' }]);
    expect(errors).toEqual(['Card 2: no name — skipped.']);
  });

  it('reports a file with no cards', () => {
    expect(vcardToContacts('first_name,last_name\nA,B').errors).toHaveLength(1);
  });
});

describe('contactsToVcard', () => {
  const ada = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    nickname: 'Countess',
    company: 'Engines, Ltd',
    title: 'Programmer',
    phones: [
      { label: 'mobile', number: '+44 1' },
      { label: 'linkedin voice', number: '+44 2' },
      { label: 'fax', number: '+44 3' },
    ],
    emails: [{ label: 'work', address: 'ada@example.com' }],
    notes: 'Line one; with semicolon\nLine two, ' + 'long '.repeat(30),
  };

  it('writes CRLF vCard 3.0 with escaped values and TYPE params', () => {
    const out = contactsToVcard([ada]);
    expect(out.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lovelace;Ada;;;\r\nFN:Ada Lovelace\r\n')).toBe(true);
    expect(out).toContain('ORG:Engines\\, Ltd\r\n');
    expect(out).toContain('TEL;TYPE=CELL:+44 1\r\n');
    // A label that isn't a safe token gets no TYPE rather than a broken one.
    expect(out).toContain('\r\nTEL:+44 2\r\n');
    expect(out).toContain('EMAIL;TYPE=INTERNET,WORK:ada@example.com\r\n');
    expect(out.endsWith('END:VCARD\r\n')).toBe(true);
    for (const line of out.split(CRLF)) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
  });

  it('round-trips through vcardToContacts', () => {
    const bo = { firstName: 'Bo', lastName: '', phones: [], emails: [] };
    const { inputs, errors } = vcardToContacts(contactsToVcard([ada, bo]));
    expect(errors).toEqual([]);
    expect(inputs).toHaveLength(2);
    const back = inputs[0]!;
    expect(back.firstName).toBe('Ada');
    expect(back.lastName).toBe('Lovelace');
    expect(back.nickname).toBe('Countess');
    expect(back.company).toBe('Engines, Ltd');
    expect(back.title).toBe('Programmer');
    expect(back.phones).toEqual([
      { label: 'mobile', number: '+44 1' },
      // Untyped TEL comes back with the default phone label.
      { label: 'mobile', number: '+44 2' },
      { label: 'fax', number: '+44 3' },
    ]);
    expect(back.emails).toEqual(ada.emails);
    expect(back.notes).toBe(ada.notes.trim());
    expect(inputs[1]!.firstName).toBe('Bo');
    expect(inputs[1]!.lastName).toBe('');
  });
});
