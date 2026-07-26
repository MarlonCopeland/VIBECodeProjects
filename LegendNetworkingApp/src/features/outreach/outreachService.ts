// src/features/outreach/outreachService.ts
// Bulk-outreach helpers. Platform reality: mobile OSes intentionally provide
// no mass-SMS API, so texting a circle is a *stepper* — one pre-filled
// compose per contact. Email can genuinely go out as one BCC message.
// Screens log the matching interaction after each successful send.

import { Linking, Platform } from 'react-native';
import type { Contact } from '../contacts/types';

export interface OutreachTarget {
  contact: Contact;
  /** Primary phone/email for this channel. */
  address: string;
}

/** Contacts reachable by SMS (first phone number wins). */
export function smsTargets(contacts: Contact[]): OutreachTarget[] {
  return contacts
    .filter((c) => c.phones.length > 0)
    .map((c) => ({ contact: c, address: c.phones[0]!.number }));
}

/** Contacts reachable by email (first address wins). */
export function emailTargets(contacts: Contact[]): OutreachTarget[] {
  return contacts
    .filter((c) => c.emails.length > 0)
    .map((c) => ({ contact: c, address: c.emails[0]!.address }));
}

/** Contacts with any phone number, for the call list. */
export function callTargets(contacts: Contact[]): OutreachTarget[] {
  return smsTargets(contacts);
}

/**
 * Open the SMS composer pre-filled for one target. Resolves true when the
 * composer reports the message was sent (iOS/Android report 'sent' or
 * 'unknown'; treat anything but explicit cancel as sent).
 */
export async function composeSms(target: OutreachTarget, body: string): Promise<boolean> {
  const SMS = await import('expo-sms');
  if (!(await SMS.isAvailableAsync())) {
    // Simulators/web: fall back to the sms: URL scheme.
    const sep = Platform.OS === 'ios' ? '&' : '?';
    await Linking.openURL(`sms:${encodeURIComponent(target.address)}${sep}body=${encodeURIComponent(body)}`);
    return true;
  }
  const { result } = await SMS.sendSMSAsync([target.address], body);
  return result !== 'cancelled';
}

/** Personalize a message template: {first} {last} {name} placeholders. */
export function personalize(template: string, contact: Contact): string {
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  return template
    .replace(/\{first\}/g, contact.firstName || name)
    .replace(/\{last\}/g, contact.lastName)
    .replace(/\{name\}/g, name);
}

/** One email to everyone via BCC (keeps recipients private from each other). */
export async function composeBccEmail(
  targets: OutreachTarget[],
  subject: string,
  body: string,
): Promise<void> {
  const bcc = targets.map((t) => t.address).join(',');
  const url = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await Linking.openURL(url);
}

/** Individual email compose for the stepper flow. */
export async function composeEmail(
  target: OutreachTarget,
  subject: string,
  body: string,
): Promise<void> {
  const url = `mailto:${encodeURIComponent(target.address)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await Linking.openURL(url);
}

/** Start a phone call. */
export async function dial(target: OutreachTarget): Promise<void> {
  await Linking.openURL(`tel:${encodeURIComponent(target.address)}`);
}
