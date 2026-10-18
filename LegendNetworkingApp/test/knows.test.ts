import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSqliteContacts } from '../src/backend/local/sql/sqliteContacts';
import { serializeHlc } from '../src/lib/hlcCore';
import {
  countKnowsSuggestions,
  knowsEdges,
  knowsForContact,
  matchFingerprint,
  normalizeName,
  normalizePhone,
  resolveKnows,
} from '../src/features/contacts/knows';
import { createNodeSqlDriver } from './support/nodeSqlDriver';
import type { ContactsApi } from '../src/backend/types';
import type { Contact, ContactInput } from '../src/features/contacts/types';

function fakeClock() {
  let n = 0;
  return {
    async nextHlc() {
      n += 1;
      return serializeHlc(1_000_000 + n, 0, 'test-device');
    },
  };
}

const OWNER = 'owner-1';

function person(firstName: string, lastName: string, phone?: string): ContactInput {
  return {
    firstName,
    lastName,
    phones: phone ? [{ label: 'mobile', number: phone }] : [],
    emails: [],
    avatarUrl: null,
    whereMet: null,
    premises: [],
    favorite: false,
    source: 'manual',
  };
}

describe('knows: normalization', () => {
  it('compares phone numbers by their last 10 digits', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('5551234567');
    expect(normalizePhone('555.123.4567')).toBe('5551234567');
    expect(normalizePhone('12')).toBe('');
  });

  it('ignores case, accents and punctuation in names', () => {
    expect(normalizeName('  José  O’Neil ')).toBe('jose o neil');
  });

  it('scores phone above name, both highest', () => {
    const c = { firstName: 'Jane', lastName: 'Doe', phones: [{ label: 'm', number: '5551234567' }] } as Contact;
    expect(matchFingerprint({ name: 'jane doe', phones: ['5551234567'] }, c).score).toBe(3);
    expect(matchFingerprint({ name: 'Someone Else', phones: ['5551234567'] }, c).score).toBe(2);
    expect(matchFingerprint({ name: 'Jane Doe', phones: [] }, c).score).toBe(1);
    expect(matchFingerprint({ name: 'Bob', phones: ['5550000000'] }, c).score).toBe(0);
  });
});

describe('knows: sqlite + resolution', () => {
  let api: ContactsApi;
  beforeEach(() => {
    api = createSqliteContacts(createNodeSqlDriver(), { ...fakeClock(), genId: randomUUID });
  });

  it('links two contacts once, mutually, and shows on both', async () => {
    const bob = await api.createContact(OWNER, person('Bob', 'Stone', '+1 555 111 2222'));
    const jane = await api.createContact(OWNER, person('Jane', 'Doe', '+1 555 123 4567'));

    const link = await api.addKnows(OWNER, bob.id, jane.id, 'college roommates');
    const again = await api.addKnows(OWNER, jane.id, bob.id);
    expect(again.id).toBe(link.id);
    expect(link.known).toEqual({ name: 'Jane Doe', phones: ['5551234567'] });

    const links = await api.listKnows(OWNER);
    expect(links).toHaveLength(1);
    const resolved = resolveKnows(links, await api.listContacts(OWNER));
    expect(knowsForContact(bob.id, resolved).linked.map((l) => l.other.id)).toEqual([jane.id]);
    expect(knowsForContact(jane.id, resolved).linked.map((l) => l.other.id)).toEqual([bob.id]);
    expect(knowsEdges(resolved)).toEqual([{ linkId: link.id, source: bob.id, target: jane.id }]);
  });

  it('refuses a self-link', async () => {
    const bob = await api.createContact(OWNER, person('Bob', 'Stone'));
    await expect(api.addKnows(OWNER, bob.id, bob.id)).rejects.toThrow();
  });

  it('survives delete + re-import: suggests the look-alike, relink makes it strong again', async () => {
    const bob = await api.createContact(OWNER, person('Bob', 'Stone', '5551112222'));
    const jane = await api.createContact(OWNER, person('Jane', 'Doe', '5551234567'));
    const link = await api.addKnows(OWNER, bob.id, jane.id);

    await api.deleteContact(OWNER, jane.id);
    // Still there, dangling.
    expect(await api.listKnows(OWNER)).toHaveLength(1);
    let resolved = resolveKnows(await api.listKnows(OWNER), await api.listContacts(OWNER));
    expect(knowsForContact(bob.id, resolved).lost).toHaveLength(1);

    // Re-imported under a new id, phone formatted differently.
    const jane2 = await api.createContact(OWNER, { ...person('Jane', 'Doe', '+1 (555) 123-4567'), source: 'csv' });
    // A name-only look-alike ranks below the full match.
    const otherJane = await api.createContact(OWNER, person('Jane', 'Doe'));
    resolved = resolveKnows(await api.listKnows(OWNER), await api.listContacts(OWNER));

    const fromBob = knowsForContact(bob.id, resolved);
    expect(fromBob.linked).toHaveLength(0);
    expect(fromBob.suggested.map((s) => s.candidate.contact.id)).toEqual([jane2.id, otherJane.id]);
    expect(fromBob.suggested[0]).toMatchObject({ missingSide: 'known', candidate: { nameMatch: true, phoneMatch: true } });

    // The re-imported contact sees the suggestion from its own side too.
    const fromJane2 = knowsForContact(jane2.id, resolved);
    expect(fromJane2.suggested).toHaveLength(1);
    expect(fromJane2.suggested[0]!.anchor.id).toBe(bob.id);
    expect(countKnowsSuggestions(resolved)).toBe(1);

    await api.relinkKnows(OWNER, link.id, 'known', jane2.id);
    resolved = resolveKnows(await api.listKnows(OWNER), await api.listContacts(OWNER));
    expect(knowsForContact(bob.id, resolved).linked.map((l) => l.other.id)).toEqual([jane2.id]);
    expect(knowsForContact(bob.id, resolved).suggested).toHaveLength(0);
    expect(knowsForContact(otherJane.id, resolved).suggested).toHaveLength(0);
  });

  it('keeps the fingerprint current when a linked contact is edited', async () => {
    const bob = await api.createContact(OWNER, person('Bob', 'Stone'));
    const jane = await api.createContact(OWNER, person('Jane', 'Doe', '5551234567'));
    await api.addKnows(OWNER, bob.id, jane.id);
    await api.updateContact(OWNER, jane.id, { lastName: 'Smith', phones: [{ label: 'work', number: '555-999-0000' }] });
    const [link] = await api.listKnows(OWNER);
    expect(link!.known).toEqual({ name: 'Jane Smith', phones: ['5559990000'] });
  });

  it('removes a link', async () => {
    const bob = await api.createContact(OWNER, person('Bob', 'Stone'));
    const jane = await api.createContact(OWNER, person('Jane', 'Doe'));
    const link = await api.addKnows(OWNER, bob.id, jane.id);
    await api.removeKnows(OWNER, link.id);
    expect(await api.listKnows(OWNER)).toHaveLength(0);
  });

  it('is owner-scoped', async () => {
    const bob = await api.createContact(OWNER, person('Bob', 'Stone'));
    const jane = await api.createContact(OWNER, person('Jane', 'Doe'));
    await api.addKnows(OWNER, bob.id, jane.id);
    expect(await api.listKnows('someone-else')).toHaveLength(0);
    await expect(api.addKnows('someone-else', bob.id, jane.id)).rejects.toThrow();
  });
});
