// test/contactMerge.test.ts
// Duplicate-contact merge: the pure field merge (contactMerge.ts) and the
// storage step (sqliteContacts.mergeContacts) against real SQLite.

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mergeContacts } from '../src/features/contacts/contactMerge';
import { createSqliteContacts } from '../src/backend/local/sql/sqliteContacts';
import { serializeHlc } from '../src/lib/hlcCore';
import { createNodeSqlDriver } from './support/nodeSqlDriver';
import type { Contact } from '../src/features/contacts/types';

function contact(over: Partial<Contact>): Contact {
  return {
    id: randomUUID(),
    ownerId: 'o',
    firstName: '',
    lastName: '',
    phones: [],
    emails: [],
    avatarUrl: null,
    whereMet: null,
    premises: [],
    favorite: false,
    source: 'manual',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...over,
  };
}

describe('mergeContacts (pure)', () => {
  it('unions entries by normalised value, keeps keep ids, fills blanks, earliest createdAt, favorite = either', () => {
    const keep = contact({
      firstName: 'Ada',
      lastName: 'Lovelace',
      company: 'Engines',
      phones: [{ id: 'kp1', label: 'mobile', number: '+1 (555) 000-1111' }],
      emails: [{ id: 'ke1', label: 'work', address: 'ada@example.com' }],
      premises: [{ id: 'kpr', kind: 'topic', label: 'Computing', tags: ['math'] }],
      notes: 'Met at the salon',
      createdAt: '2026-06-01T00:00:00.000Z',
    });
    const drop = contact({
      firstName: 'Ada',
      lastName: 'L.',
      title: 'Countess',
      phones: [
        { id: 'dp1', label: 'home', number: '5550001111' },
        { id: 'dp2', label: 'work', number: '+1 555 000 2222' },
      ],
      emails: [{ id: 'de1', label: 'home', address: ' ADA@example.com ' }],
      premises: [
        { id: 'dpr1', kind: 'topic', label: 'computing ', tags: ['math', 'engines'] },
        { id: 'dpr2', kind: 'hobby', label: 'poetry', tags: [] },
      ],
      notes: 'Loves poetry',
      favorite: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const { merged, createdAt, premiseIdMap } = mergeContacts(keep, drop, () => 'new-id');
    expect(merged.lastName).toBe('Lovelace');
    expect(merged.title).toBe('Countess');
    expect(merged.company).toBe('Engines');
    expect(merged.phones).toEqual([
      { id: 'kp1', label: 'mobile', number: '+1 (555) 000-1111' },
      { label: 'work', number: '+1 555 000 2222' },
    ]);
    expect(merged.emails).toEqual([{ id: 'ke1', label: 'work', address: 'ada@example.com' }]);
    expect(merged.premises).toEqual([
      { id: 'kpr', kind: 'topic', label: 'Computing', tags: ['math', 'engines'] },
      { id: 'new-id', kind: 'hobby', label: 'poetry', tags: [] },
    ]);
    expect(premiseIdMap).toEqual({ dpr1: 'kpr', dpr2: 'new-id' });
    expect(merged.notes).toBe('Met at the salon\n\nLoves poetry');
    expect(merged.favorite).toBe(true);
    expect(createdAt).toBe('2026-01-01T00:00:00.000Z');
    // keep's own premise object isn't mutated.
    expect(keep.premises[0]!.tags).toEqual(['math']);
  });

  it('does not repeat identical notes and leaves notes empty when both are', () => {
    const a = contact({ firstName: 'A', notes: 'same' });
    expect(mergeContacts(a, contact({ firstName: 'B', notes: ' same ' }), randomUUID).merged.notes).toBe('same');
    expect(mergeContacts(contact({ firstName: 'A' }), contact({ firstName: 'B' }), randomUUID).merged.notes).toBeUndefined();
  });
});

describe('sqliteContacts.mergeContacts', () => {
  it('writes the merge onto keep, repoints interactions, tombstones drop', async () => {
    let n = 0;
    const driver = createNodeSqlDriver();
    const api = createSqliteContacts(driver, {
      async nextHlc() {
        n += 1;
        return serializeHlc(1_000_000 + n, 0, 'test');
      },
      genId: randomUUID,
    });
    const premiseId = randomUUID();
    const base = { avatarUrl: null, whereMet: null, favorite: false, source: 'manual' as const };
    const keep = await api.createContact('o', {
      ...base,
      firstName: 'Ada',
      lastName: 'Lovelace',
      phones: [{ label: 'mobile', number: '5550001111' }],
      emails: [],
      premises: [],
    });
    const drop = await api.createContact('o', {
      ...base,
      firstName: 'Ada',
      lastName: '',
      phones: [{ label: 'home', number: '+1 555 000 1111' }, { label: 'work', number: '5550002222' }],
      emails: [{ label: 'home', address: 'ada@example.com' }],
      premises: [{ id: premiseId, kind: 'hobby', label: 'poetry', tags: ['poems'] }],
      favorite: true,
    });
    const it1 = await api.logInteraction('o', { contactId: drop.id, kind: 'premise', premiseId });
    await api.logInteraction('o', { contactId: keep.id, kind: 'call' });

    const merged = await api.mergeContacts('o', keep.id, drop.id);

    expect(merged.id).toBe(keep.id);
    expect(merged.phones.map((p) => p.number)).toEqual(['5550001111', '5550002222']);
    expect(merged.phones[0]!.id).toBe(keep.phones[0]!.id);
    expect(merged.emails.map((e) => e.address)).toEqual(['ada@example.com']);
    expect(merged.premises).toHaveLength(1);
    expect(merged.premises[0]!.id).not.toBe(premiseId);
    expect(merged.favorite).toBe(true);

    const list = await api.listContacts('o');
    expect(list.map((c) => c.id)).toEqual([keep.id]);
    const its = await api.listInteractions('o');
    expect(its).toHaveLength(2);
    expect(its.every((i) => i.contactId === keep.id)).toBe(true);
    expect(its.find((i) => i.id === it1.id)!.premiseId).toBe(merged.premises[0]!.id);
    const dropRow = await driver.getFirstAsync<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM contacts WHERE id = ?',
      [drop.id],
    );
    expect(dropRow!.deleted_at).not.toBeNull();
    await expect(api.mergeContacts('o', keep.id, keep.id)).rejects.toThrow();
  });

  it('moves drop’s circle pins/excludes to keep unless keep already has an entry there', async () => {
    let n = 0;
    const api = createSqliteContacts(createNodeSqlDriver(), {
      async nextHlc() {
        n += 1;
        return serializeHlc(2_000_000 + n, 0, 'test');
      },
      genId: randomUUID,
    });
    const base = { avatarUrl: null, whereMet: null, favorite: false, source: 'manual' as const, phones: [], emails: [], premises: [] };
    const keep = await api.createContact('o', { ...base, firstName: 'Keep', lastName: '' });
    const drop = await api.createContact('o', { ...base, firstName: 'Drop', lastName: '' });
    const q = { kinds: [], tags: [] };
    // c1: only drop pinned -> keep pinned.
    const c1 = await api.createCircle('o', { name: 'c1', query: q, pinnedContactIds: [drop.id] });
    // c2: keep excluded, drop pinned -> keep's exclude wins, no pin.
    const c2 = await api.createCircle('o', { name: 'c2', query: q, pinnedContactIds: [drop.id], excludedContactIds: [keep.id] });
    // c3: only drop excluded -> keep excluded.
    const c3 = await api.createCircle('o', { name: 'c3', query: q, excludedContactIds: [drop.id] });
    // c4: keep pinned, drop excluded -> keep stays pinned only.
    const c4 = await api.createCircle('o', { name: 'c4', query: q, pinnedContactIds: [keep.id], excludedContactIds: [drop.id] });

    await api.mergeContacts('o', keep.id, drop.id);

    const byName = new Map((await api.listCircles('o')).map((c) => [c.name, c]));
    const view = (id: string) => {
      const c = [...byName.values()].find((x) => x.id === id)!;
      return { pins: c.pinnedContactIds, excl: c.excludedContactIds };
    };
    expect(view(c1.id)).toEqual({ pins: [keep.id], excl: [] });
    expect(view(c2.id)).toEqual({ pins: [], excl: [keep.id] });
    expect(view(c3.id)).toEqual({ pins: [], excl: [keep.id] });
    expect(view(c4.id)).toEqual({ pins: [keep.id], excl: [] });
  });
});
