// src/features/contacts/premiseSuggest.ts
// Premise autocomplete: suggest labels and tags the user has already used on
// other contacts, so "real-estate" doesn't drift into "realestate" and
// "Real Estate" across the network (Circles match on exact tags, so drift
// silently splits a circle). Pure functions, ZERO react-native/expo imports,
// so it unit-tests in plain Node; app/(app)/contact/edit.tsx renders the
// results as tappable chips.

import type { Contact } from './types';

/** One distinct label or tag seen across the network. */
export interface VocabEntry {
  /** Display form: the casing from the most recently updated contact. */
  value: string;
  /** How many premises (labels) or premise tag slots (tags) use it. */
  count: number;
  /** Latest `updatedAt` of a contact that uses it (ISO string; sorts as text). */
  lastUsed: string;
}

export interface PremiseVocabulary {
  labels: VocabEntry[];
  tags: VocabEntry[];
}

function add(map: Map<string, VocabEntry>, raw: string, at: string): void {
  const value = raw.trim();
  if (!value) return;
  const key = value.toLowerCase();
  const prev = map.get(key);
  if (!prev) {
    map.set(key, { value, count: 1, lastUsed: at });
    return;
  }
  prev.count += 1;
  if (at > prev.lastUsed) {
    prev.lastUsed = at;
    prev.value = value;
  }
}

/** Distinct premise labels and tags across contacts, case-insensitively
 * merged. `excludeContactId` leaves out the contact being edited, so its own
 * half-typed or about-to-change values don't suggest themselves. */
export function collectPremiseVocabulary(
  contacts: Pick<Contact, 'id' | 'premises' | 'updatedAt'>[],
  excludeContactId?: string,
): PremiseVocabulary {
  const labels = new Map<string, VocabEntry>();
  const tags = new Map<string, VocabEntry>();
  for (const c of contacts) {
    if (c.id === excludeContactId) continue;
    for (const p of c.premises) {
      add(labels, p.label, c.updatedAt);
      for (const t of p.tags) add(tags, t, c.updatedAt);
    }
  }
  return { labels: [...labels.values()], tags: [...tags.values()] };
}

export interface SuggestOptions {
  /** Max suggestions returned (default 5). */
  limit?: number;
  /** Values to leave out (case-insensitive), e.g. tags already on the premise. */
  exclude?: string[];
}

/**
 * Rank vocabulary entries against what's typed. Empty query -> nothing (the
 * chips only appear once the user starts typing). Prefix matches beat
 * substring matches; within each, more uses first, then most recent, then
 * A-Z. An entry equal to the query is dropped: it's already typed.
 */
export function suggestPremiseValues(entries: VocabEntry[], query: string, opts: SuggestOptions = {}): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const limit = opts.limit ?? 5;
  const excluded = new Set((opts.exclude ?? []).map((e) => e.trim().toLowerCase()));
  return entries
    .map((e) => ({ e, key: e.value.toLowerCase() }))
    .filter(({ key }) => key !== q && !excluded.has(key) && key.includes(q))
    .sort((a, b) => {
      const ap = a.key.startsWith(q) ? 0 : 1;
      const bp = b.key.startsWith(q) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      if (a.e.count !== b.e.count) return b.e.count - a.e.count;
      if (a.e.lastUsed !== b.e.lastUsed) return a.e.lastUsed < b.e.lastUsed ? 1 : -1;
      return a.key.localeCompare(b.key);
    })
    .slice(0, limit)
    .map(({ e }) => e.value);
}

/** Split a comma-separated tags field into the finished tags and the one
 * still being typed (the text after the last comma). */
export function splitTagsText(tagsText: string): { done: string[]; current: string } {
  const parts = tagsText.split(',');
  const current = parts.pop() ?? '';
  return { done: parts.map((t) => t.trim()).filter(Boolean), current: current.trim() };
}

/** Replace the tag being typed with `tag`, leaving ", " ready for the next. */
export function applyTagSuggestion(tagsText: string, tag: string): string {
  const { done } = splitTagsText(tagsText);
  return [...done, tag].join(', ') + ', ';
}

/** Tag suggestions for a tags field: matches the token being typed and skips
 * tags already listed in the field. */
export function suggestTags(vocab: PremiseVocabulary, tagsText: string, limit = 5): string[] {
  const { done, current } = splitTagsText(tagsText);
  return suggestPremiseValues(vocab.tags, current, { limit, exclude: done });
}
