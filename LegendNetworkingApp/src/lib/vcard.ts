// src/lib/vcard.ts
// Minimal vCard 3.0 / 4.0 (RFC 2426 / RFC 6350) parse and serialize at the
// line level: unfolding, property/parameter splitting, text escaping and
// output folding. It knows nothing about Legend's Contact shape (that lives in
// src/features/contacts/vcardMapping.ts), the same split as csv.ts vs.
// csvMapping.ts. Hand-rolled so import/export needs no dependency.
//
// Deliberately out of scope: vCard 2.1 QUOTED-PRINTABLE / CHARSET values and
// embedded PHOTO data. They parse without error (the property is just carried
// as raw text) but are not decoded.

/** One content line, e.g. `item1.TEL;TYPE=CELL,VOICE:+1 555 0100`. */
export interface VCardProperty {
  /** Upper-cased property name, group prefix removed ("TEL"). */
  name: string;
  /** Upper-cased parameter names -> their values (raw, quotes removed).
   * Comma-joined values ("TYPE=cell,voice") and repeated parameters
   * ("TYPE=CELL;TYPE=VOICE") both end up as separate entries. Bare 2.1-style
   * parameters (";CELL") are filed under TYPE. */
  params: Record<string, string[]>;
  /** The raw value, still escaped: callers decide whether it's a single text
   * value or a ';'-structured one (N, ORG, ADR) before unescaping. */
  value: string;
}

/** One BEGIN:VCARD ... END:VCARD block. */
export interface VCard {
  properties: VCardProperty[];
}

/** Undo line folding: a line break followed by one space or tab continues
 * the previous line (RFC 6350 §3.2). Accepts CRLF, LF or bare CR. */
export function unfoldLines(text: string): string[] {
  return text
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

/** Split `s` on `sep` where it isn't backslash-escaped. Escapes are kept so
 * each component can be unescaped on its own afterwards. */
export function splitUnescaped(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '\\' && i + 1 < s.length) {
      cur += ch + s[i + 1];
      i++;
    } else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Decode a TEXT value: \n or \N -> newline, \, \; \\ -> the literal char.
 * Unknown escapes keep the escaped character (lenient, as real files from
 * phones are not always strict). */
export function unescapeText(s: string): string {
  return s.replace(/\\(.)/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Encode a TEXT value for output. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Parse one unfolded content line; null when it has no ':' at all. */
export function parsePropertyLine(line: string): VCardProperty | null {
  // The value starts at the first ':' outside a quoted parameter value
  // (4.0 allows quoted params, which may themselves contain ':').
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = splitParams(head);
  const nameWithGroup = parts.shift() ?? '';
  const dot = nameWithGroup.lastIndexOf('.');
  const name = (dot >= 0 ? nameWithGroup.slice(dot + 1) : nameWithGroup).trim().toUpperCase();

  const params: Record<string, string[]> = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    const key = (eq >= 0 ? p.slice(0, eq) : 'TYPE').trim().toUpperCase();
    const raw = eq >= 0 ? p.slice(eq + 1) : p;
    for (const v of splitQuotedList(raw)) {
      if (!v) continue;
      (params[key] ??= []).push(v);
    }
  }
  return { name, params, value };
}

/** Split the name+params head on ';' outside quotes. */
function splitParams(head: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of head) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
    } else if (ch === ';' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** `cell,"voice,home"` -> ['cell', 'voice', 'home'], quotes removed. Commas
 * inside quotes split too: RFC 6350's own examples write TYPE="voice,cell"
 * to mean a two-value list, and that is what real 4.0 exporters emit. */
function splitQuotedList(raw: string): string[] {
  return raw
    .replace(/"/g, '')
    .split(',')
    .map((v) => v.trim());
}

/** Parse a .vcf file (any number of cards) into cards. Lines outside a
 * BEGIN/END block, and lines without a ':', are ignored; an unterminated
 * last card is still returned rather than silently dropped. */
export function parseVCards(text: string): VCard[] {
  const cards: VCard[] = [];
  let current: VCard | null = null;
  for (const line of unfoldLines(text.replace(/^﻿/, ''))) {
    if (!line.trim()) continue;
    const prop = parsePropertyLine(line);
    if (!prop) continue;
    const v = prop.value.trim().toUpperCase();
    if (prop.name === 'BEGIN' && v === 'VCARD') {
      if (current) cards.push(current);
      current = { properties: [] };
    } else if (prop.name === 'END' && v === 'VCARD') {
      if (current) cards.push(current);
      current = null;
    } else if (current) {
      current.properties.push(prop);
    }
  }
  if (current) cards.push(current);
  return cards;
}

/** Fold one content line to at most 75 UTF-8 octets per physical line
 * (RFC 6350 §3.2), never splitting a character. Continuations start with a
 * space, which counts toward their 75. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = utf8Length(ch);
    if (bytes + b > limit) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

function utf8Length(ch: string): number {
  const cp = ch.codePointAt(0)!;
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

/** Serialize content lines into a CRLF-terminated, folded card. */
export function serializeVCard(lines: string[]): string {
  return ['BEGIN:VCARD', ...lines, 'END:VCARD'].map(foldLine).join('\r\n') + '\r\n';
}
