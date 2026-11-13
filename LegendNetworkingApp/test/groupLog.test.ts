// test/groupLog.test.ts
// Group interaction logging (src/features/contacts/groupLog.ts) — pure
// functions, no react-native/expo imports, so this runs in plain Node.

import { describe, expect, it } from 'vitest';
import { buildGroupInteractions, searchContactsForGroup } from '../src/features/contacts/groupLog';

const AT = '2026-11-01T09:30:00.000Z';

describe('buildGroupInteractions', () => {
  it('writes one interaction per person, primary first, with a shared time and note', () => {
    expect(buildGroupInteractions('a', ['b', 'c'], { kind: 'premise', note: ' NAACP Gala ', occurredAt: AT })).toEqual([
      { contactId: 'a', kind: 'premise', occurredAt: AT, note: 'NAACP Gala' },
      { contactId: 'b', kind: 'premise', occurredAt: AT, note: 'NAACP Gala' },
      { contactId: 'c', kind: 'premise', occurredAt: AT, note: 'NAACP Gala' },
    ]);
  });

  it('drops duplicates (including the primary picked again) and blank notes', () => {
    expect(buildGroupInteractions('a', ['b', 'a', 'b', ''], { kind: 'visit', note: '   ', occurredAt: AT })).toEqual([
      { contactId: 'a', kind: 'visit', occurredAt: AT },
      { contactId: 'b', kind: 'visit', occurredAt: AT },
    ]);
  });

  it('with nobody else picked is just the single log', () => {
    expect(buildGroupInteractions('a', [], { kind: 'note', occurredAt: AT })).toEqual([
      { contactId: 'a', kind: 'note', occurredAt: AT },
    ]);
  });
});

describe('searchContactsForGroup', () => {
  const people = [
    { id: '1', firstName: 'Ada', lastName: 'Lovelace' },
    { id: '2', firstName: 'Grace', lastName: 'Hopper', nickname: 'Amazing Grace' },
    { id: '3', firstName: 'Adam', lastName: 'Smith' },
    { id: '4', firstName: 'Linus', lastName: 'Adair' },
    { id: '5', firstName: 'Brad', lastName: 'Pitt' },
  ];

  it('matches name words and nicknames case-insensitively, word-prefix first, then A-Z', () => {
    expect(searchContactsForGroup(people, 'AD', []).map((c) => c.id)).toEqual(['1', '3', '4', '5']);
    expect(searchContactsForGroup(people, 'amazing', []).map((c) => c.id)).toEqual(['2']);
    expect(searchContactsForGroup(people, 'ada lov', []).map((c) => c.id)).toEqual(['1']);
  });

  it('skips excluded ids, honours the limit, and returns nothing for an empty query', () => {
    expect(searchContactsForGroup(people, 'ad', ['1', '3'], 1).map((c) => c.id)).toEqual(['4']);
    expect(searchContactsForGroup(people, '  ', [])).toEqual([]);
    expect(searchContactsForGroup(people, 'zzz', [])).toEqual([]);
  });
});
