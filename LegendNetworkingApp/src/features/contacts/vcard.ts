// src/features/contacts/vcard.ts
// Contact → vCard 3.0 text. Used by the ME tab's QR code so any phone camera
// can scan Legend's card straight into its native contacts app. vCard 3.0
// (not 4.0) because iOS and Android camera scanners both handle it reliably.

import type { Contact } from './types';

/** Escape per RFC 2426: backslash, comma, semicolon, and newlines. */
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n');
}

export function contactToVCard(contact: Contact): string {
  const fullName = `${contact.firstName} ${contact.lastName}`.trim();
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(contact.lastName)};${esc(contact.firstName)};;;`,
    `FN:${esc(fullName || contact.nickname || 'Unnamed')}`,
  ];
  if (contact.nickname) lines.push(`NICKNAME:${esc(contact.nickname)}`);
  if (contact.company) lines.push(`ORG:${esc(contact.company)}`);
  if (contact.title) lines.push(`TITLE:${esc(contact.title)}`);
  for (const p of contact.phones) {
    lines.push(`TEL;TYPE=${esc(p.label || 'voice')}:${esc(p.number)}`);
  }
  for (const e of contact.emails) {
    lines.push(`EMAIL;TYPE=${esc(e.label || 'internet')}:${esc(e.address)}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n');
}
