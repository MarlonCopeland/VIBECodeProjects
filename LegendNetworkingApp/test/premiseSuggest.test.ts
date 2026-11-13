// test/premiseSuggest.test.ts
// Premise autocomplete (src/features/contacts/premiseSuggest.ts) — pure
// functions, no react-native/expo imports, so this runs in plain Node.

import { describe, expect, it } from 'vitest';
import {
  applyTagSuggestion,
  collectPremiseVocabulary,
  splitTagsText,
  suggestPremiseValues,
  suggestTags,
  type VocabEntry,
} from '../src/features/contacts/premiseSuggest';
import type { Premise } from '../src/features/contacts/types';

let n = 0;
function premise(label: string, tags: string[]): Premise {
  n += 1;
  return { id: `p${n}`, kind: 'topic', label, tags };
}

const contacts = [
  { id: 'a', updatedAt: '2026-01-01T00:00:00Z', premises: [premise('Real estate investing', ['real-estate', 'investing'])] },
  { id: 'b', updatedAt: '2026-03-01T00:00:00Z', premises: [premise('real estate investing', ['Real-Estate', 'chess'])] },
  { id: 'c', updatedAt: '2026-02-01T00:00:00Z', premises: [premise('Chess club', ['chess', 'Estates'])] },
];

describe('collectPremiseVocabulary', () => {
  it('merges labels and tags case-insensitively, counting uses and keeping the latest casing', () => {
    const v = collectPremiseVocabulary(contacts);
    const label = v.labels.find((l) => l.value.toLowerCase() === 'real estate investing')!;
    expect(label).toEqual({ value: 'real estate investing', count: 2, lastUsed: '2026-03-01T00:00:00Z' });
    const tag = v.tags.find((t) => t.value.toLowerCase() === 'real-estate')!;
    expect(tag).toEqual({ value: 'Real-Estate', count: 2, lastUsed: '2026-03-01T00:00:00Z' });
    expect(v.tags.find((t) => t.value === 'chess')!.count).toBe(2);
  });

  it('can leave out the contact being edited and ignores blanks', () => {
    const v = collectPremiseVocabulary(
      [...contacts, { id: 'z', updatedAt: '2026-04-01T00:00:00Z', premises: [premise('  ', ['', ' '])] }],
      'b',
    );
    expect(v.labels.find((l) => l.value.toLowerCase() === 'real estate investing')!.count).toBe(1);
    expect(v.tags.find((t) => t.value === 'chess')!.count).toBe(1);
    expect(v.labels.every((l) => l.value.trim())).toBe(true);
    expect(v.tags.every((t) => t.value.trim())).toBe(true);
  });
});

describe('suggestPremiseValues', () => {
  const entries: VocabEntry[] = [
    { value: 'estates', count: 1, lastUsed: '2026-02-01' },
    { value: 'real-estate', count: 3, lastUsed: '2026-01-01' },
    { value: 'esports', count: 3, lastUsed: '2026-01-01' },
    { value: 'essays', count: 3, lastUsed: '2026-05-01' },
    { value: 'chess', count: 9, lastUsed: '2026-05-01' },
  ];

  it('ranks prefix over substring, then count, then recency, then A-Z', () => {
    expect(suggestPremiseValues(entries, 'es')).toEqual(['essays', 'esports', 'estates', 'chess', 'real-estate']);
    expect(suggestPremiseValues(entries, 'ESTATE')).toEqual(['estates', 'real-estate']);
  });

  it('returns nothing for an empty query, drops exact matches and exclusions, honours the limit', () => {
    expect(suggestPremiseValues(entries, '   ')).toEqual([]);
    expect(suggestPremiseValues(entries, 'Chess')).toEqual([]);
    expect(suggestPremiseValues(entries, 'es', { exclude: ['ESSAYS'], limit: 2 })).toEqual(['esports', 'estates']);
  });
});

describe('tag field helpers', () => {
  it('splits finished tags from the one being typed', () => {
    expect(splitTagsText('chess, real-estate, inv')).toEqual({ done: ['chess', 'real-estate'], current: 'inv' });
    expect(splitTagsText('')).toEqual({ done: [], current: '' });
    expect(splitTagsText('chess, ')).toEqual({ done: ['chess'], current: '' });
  });

  it('completes the current token and leaves room for the next', () => {
    expect(applyTagSuggestion('chess, inv', 'investing')).toBe('chess, investing, ');
    expect(applyTagSuggestion('', 'chess')).toBe('chess, ');
  });

  it('suggests tags for the current token, skipping ones already in the field', () => {
    const v = collectPremiseVocabulary(contacts);
    expect(suggestTags(v, 'chess, e')).toEqual(['Estates', 'Real-Estate', 'investing']);
    expect(suggestTags(v, 'Real-Estate, re')).toEqual([]);
    expect(suggestTags(v, 'chess, ')).toEqual([]);
  });
});
