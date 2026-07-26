// src/features/circles/circlesService.ts
// Circle-of-influence matching: scores every contact against a circle's
// premise query. Pure functions — the ContactsContext supplies the data.
//
// Scoring (see TASKS.md): +3 per matching tag, +2 per matching premise kind,
// +2 when the free-text hits a premise label / company / title, +5 pinned.
// Excluded contacts never appear; everyone else needs score > 0.

import type { Circle, Contact, PremiseQuery } from '../contacts/types';
import type { Grade } from '../contacts/grading';

export interface CircleMatch {
  contact: Contact;
  grade: Grade;
  score: number;
  /** Human-readable explanations, e.g. `tag "civic"`, `pinned`. */
  reasons: string[];
  pinned: boolean;
}

export function matchQuery(
  contact: Contact,
  query: PremiseQuery,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const tags = new Set(query.tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
  const kinds = new Set(query.kinds);
  const text = (query.text ?? '').trim().toLowerCase();

  const contactTags = new Set(
    contact.premises.flatMap((p) => p.tags.map((t) => t.toLowerCase())),
  );
  for (const tag of tags) {
    if (contactTags.has(tag)) {
      score += 3;
      reasons.push(`tag "${tag}"`);
    }
  }

  for (const kind of kinds) {
    if (contact.premises.some((p) => p.kind === kind)) {
      score += 2;
      reasons.push(`${kind} premise`);
    }
  }

  if (text) {
    const haystacks = [
      ...contact.premises.map((p) => p.label),
      contact.company ?? '',
      contact.title ?? '',
      contact.whereMet?.placeName ?? '',
    ].map((s) => s.toLowerCase());
    if (haystacks.some((h) => h.includes(text))) {
      score += 2;
      reasons.push(`matches "${text}"`);
    }
  }

  return { score, reasons };
}

/**
 * Resolve a circle to its member list, sorted best-match first (then by
 * grade). Pinned contacts always appear (listed by score like the rest, with
 * +5); excluded never do.
 */
export function matchCircle(
  circle: Circle,
  contacts: Contact[],
  gradeFor: (contactId: string) => Grade,
): CircleMatch[] {
  const excluded = new Set(circle.excludedContactIds);
  const pinned = new Set(circle.pinnedContactIds);

  const matches: CircleMatch[] = [];
  for (const contact of contacts) {
    if (excluded.has(contact.id)) continue;
    const { score, reasons } = matchQuery(contact, circle.query);
    const isPinned = pinned.has(contact.id);
    const total = score + (isPinned ? 5 : 0);
    if (total <= 0) continue;
    matches.push({
      contact,
      grade: gradeFor(contact.id),
      score: total,
      reasons: isPinned ? ['pinned', ...reasons] : reasons,
      pinned: isPinned,
    });
  }

  return matches.sort(
    (a, b) => b.score - a.score || b.grade.score - a.grade.score,
  );
}

/** All distinct premise tags across the network — feeds tag pickers. */
export function collectTags(contacts: Contact[]): string[] {
  const tally = new Map<string, number>();
  for (const c of contacts) {
    for (const p of c.premises) {
      for (const t of p.tags) {
        const tag = t.toLowerCase();
        tally.set(tag, (tally.get(tag) ?? 0) + 1);
      }
    }
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}
