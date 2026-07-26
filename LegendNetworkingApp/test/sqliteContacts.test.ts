import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSqliteContacts } from '../src/backend/local/sql/sqliteContacts';
import { serializeHlc } from '../src/lib/hlcCore';
import { createNodeSqlDriver } from './support/nodeSqlDriver';
import type { ContactsApi } from '../src/backend/types';
import type { ContactInput } from '../src/features/contacts/types';

// A deterministic fake clock — each call returns a strictly greater HLC, no
// wall-clock/AsyncStorage involved. This is the whole point of injecting
// the clock: the real one (src/lib/hlc.ts) touches AsyncStorage and isn't
// needed to prove the SQL/merge logic is correct.
function fakeClock() {
  let n = 0;
  return {
    async nextHlc() {
      n += 1;
      return serializeHlc(1_000_000 + n, 0, 'test-device');
    },
  };
}

function makeApi(): ContactsApi {
  return createSqliteContacts(createNodeSqlDriver(), { ...fakeClock(), genId: randomUUID });
}

const OWNER = 'owner-1';

function baseInput(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    phones: [{ label: 'mobile', number: '+15550001111' }],
    emails: [{ label: 'work', address: 'ada@example.com' }],
    avatarUrl: null,
    whereMet: { placeName: 'Analytical Society', city: 'London' },
    premises: [{ id: randomUUID(), kind: 'expertise', label: 'computing', tags: ['math', 'computing'] }],
    favorite: false,
    source: 'manual',
    ...overrides,
  };
}

describe('sqliteContacts: contacts', () => {
  let api: ContactsApi;
  beforeEach(() => {
    api = makeApi();
  });

  it('creates and lists a contact with its child rows assembled', async () => {
    const created = await api.createContact(OWNER, baseInput());
    const list = await api.listContacts(OWNER);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: created.id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      phones: [{ label: 'mobile', number: '+15550001111' }],
      emails: [{ label: 'work', address: 'ada@example.com' }],
      whereMet: { placeName: 'Analytical Society', city: 'London' },
    });
    expect(list[0]!.premises).toHaveLength(1);
    expect(list[0]!.premises[0]).toMatchObject({ kind: 'expertise', label: 'computing', tags: ['math', 'computing'] });
  });

  it('scopes contacts by owner', async () => {
    await api.createContact(OWNER, baseInput());
    await api.createContact('owner-2', baseInput({ firstName: 'Bob' }));

    expect(await api.listContacts(OWNER)).toHaveLength(1);
    expect(await api.listContacts('owner-2')).toHaveLength(1);
  });

  it('updates a simple field without touching phones/emails/premises', async () => {
    const created = await api.createContact(OWNER, baseInput());
    const updated = await api.updateContact(OWNER, created.id, { title: 'Countess of Lovelace' });

    expect(updated.title).toBe('Countess of Lovelace');
    expect(updated.phones).toEqual(created.phones);
    expect(updated.premises).toEqual(created.premises);
  });

  it('replaces phones wholesale on update (documented limitation — no stable id yet)', async () => {
    const created = await api.createContact(OWNER, baseInput());
    const updated = await api.updateContact(OWNER, created.id, {
      phones: [{ label: 'home', number: '+15559998888' }],
    });

    expect(updated.phones).toEqual([{ label: 'home', number: '+15559998888' }]);
  });

  it('upserts premises by id — keeps unrelated ones, updates matched ones, drops removed ones', async () => {
    const keep = { id: randomUUID(), kind: 'hobby' as const, label: 'chess', tags: ['chess'] };
    const change = { id: randomUUID(), kind: 'topic' as const, label: 'old label', tags: ['old'] };
    const created = await api.createContact(OWNER, baseInput({ premises: [keep, change] }));

    const updated = await api.updateContact(OWNER, created.id, {
      premises: [keep, { ...change, label: 'new label', tags: ['new'] }],
    });

    expect(updated.premises).toHaveLength(2);
    const keepResult = updated.premises.find((p) => p.id === keep.id);
    const changedResult = updated.premises.find((p) => p.id === change.id);
    expect(keepResult).toMatchObject({ label: 'chess' });
    expect(changedResult).toMatchObject({ label: 'new label', tags: ['new'] });

    // Now drop `change` entirely.
    const afterDrop = await api.updateContact(OWNER, created.id, { premises: [keep] });
    expect(afterDrop.premises.map((p) => p.id)).toEqual([keep.id]);
  });

  it('tombstones on delete — contact and its interactions disappear from lists', async () => {
    const created = await api.createContact(OWNER, baseInput());
    await api.logInteraction(OWNER, { contactId: created.id, kind: 'call' });

    await api.deleteContact(OWNER, created.id);

    expect(await api.listContacts(OWNER)).toHaveLength(0);
    expect(await api.listInteractions(OWNER)).toHaveLength(0);
  });

  it('bulk-creates via createContacts', async () => {
    const rows = await api.createContacts(OWNER, [
      baseInput({ firstName: 'A' }),
      baseInput({ firstName: 'B' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(await api.listContacts(OWNER)).toHaveLength(2);
  });
});

describe('sqliteContacts: interactions', () => {
  let api: ContactsApi;
  let contactId: string;
  beforeEach(async () => {
    api = makeApi();
    contactId = (await api.createContact(OWNER, baseInput())).id;
  });

  it('logs and lists interactions, newest and oldest alike', async () => {
    await api.logInteraction(OWNER, { contactId, kind: 'call' });
    await api.logInteraction(OWNER, { contactId, kind: 'text', note: 'hello' });

    const list = await api.listInteractions(OWNER);
    expect(list).toHaveLength(2);
    expect(list.find((i) => i.kind === 'text')?.note).toBe('hello');
  });

  it('rejects logging against a contact the owner does not own', async () => {
    await expect(api.logInteraction('someone-else', { contactId, kind: 'call' })).rejects.toThrow();
  });

  it('tombstones a deleted interaction out of the list', async () => {
    const logged = await api.logInteraction(OWNER, { contactId, kind: 'visit' });
    await api.deleteInteraction(OWNER, logged.id);
    expect(await api.listInteractions(OWNER)).toHaveLength(0);
  });
});

describe('sqliteContacts: circles', () => {
  let api: ContactsApi;
  let a: string;
  let b: string;
  let c: string;
  beforeEach(async () => {
    api = makeApi();
    a = (await api.createContact(OWNER, baseInput({ firstName: 'A' }))).id;
    b = (await api.createContact(OWNER, baseInput({ firstName: 'B' }))).id;
    c = (await api.createContact(OWNER, baseInput({ firstName: 'C' }))).id;
  });

  it('creates a circle with initial pins/excludes', async () => {
    const circle = await api.createCircle(OWNER, {
      name: 'Test Circle',
      query: { kinds: [], tags: ['math'] },
      pinnedContactIds: [a],
      excludedContactIds: [b],
    });
    expect(circle.pinnedContactIds).toEqual([a]);
    expect(circle.excludedContactIds).toEqual([b]);
  });

  it('diffs pins on update — adds new, removes dropped, leaves untouched ones alone', async () => {
    const circle = await api.createCircle(OWNER, {
      name: 'Test Circle',
      query: { kinds: [], tags: [] },
      pinnedContactIds: [a, b],
    });

    const updated = await api.updateCircle(OWNER, circle.id, { pinnedContactIds: [b, c] });
    expect(new Set(updated.pinnedContactIds)).toEqual(new Set([b, c]));
  });

  it('tombstones a deleted circle out of the list', async () => {
    const circle = await api.createCircle(OWNER, { name: 'Gone Soon', query: { kinds: [], tags: [] } });
    await api.deleteCircle(OWNER, circle.id);
    expect(await api.listCircles(OWNER)).toHaveLength(0);
  });
});
