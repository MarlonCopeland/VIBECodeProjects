import { describe, expect, it } from 'vitest';
import { computeGrade, tierForScore } from '../src/features/contacts/grading';
import type { Interaction } from '../src/features/contacts/types';

function interaction(kind: Interaction['kind'], daysAgo: number): Interaction {
  return {
    id: `${kind}-${daysAgo}`,
    contactId: 'c1',
    kind,
    occurredAt: new Date(Date.UTC(2026, 0, 1) - daysAgo * 86_400_000).toISOString(),
  };
}

const NOW = Date.UTC(2026, 0, 1);

describe('grading', () => {
  it('gives a contact with no interactions a Common grade with no freshness', () => {
    const grade = computeGrade([], NOW);
    expect(grade.score).toBe(0);
    expect(grade.tier.id).toBe('common');
    expect(grade.freshnessDays).toBeNull();
  });

  it('scores a fresh visit near its full weight', () => {
    const grade = computeGrade([interaction('visit', 0)], NOW);
    expect(grade.score).toBe(15);
    expect(grade.freshnessDays).toBe(0);
  });

  it('decays a call to roughly half its weight after one half-life (45 days)', () => {
    const grade = computeGrade([interaction('call', 45)], NOW);
    expect(grade.score).toBe(5); // round(10 * 0.5)
  });

  it('caps the score at 100 regardless of how many interactions pile up', () => {
    const many = Array.from({ length: 20 }, () => interaction('visit', 0));
    const grade = computeGrade(many, NOW);
    expect(grade.score).toBe(100);
  });

  it('reports freshness from the most recent interaction, not the oldest', () => {
    const grade = computeGrade([interaction('call', 30), interaction('text', 2)], NOW);
    expect(grade.freshnessDays).toBe(2);
  });

  it('maps scores to tiers at the documented boundaries', () => {
    expect(tierForScore(0).id).toBe('common');
    expect(tierForScore(19).id).toBe('common');
    expect(tierForScore(20).id).toBe('uncommon');
    expect(tierForScore(39).id).toBe('uncommon');
    expect(tierForScore(40).id).toBe('rare');
    expect(tierForScore(59).id).toBe('rare');
    expect(tierForScore(60).id).toBe('epic');
    expect(tierForScore(79).id).toBe('epic');
    expect(tierForScore(80).id).toBe('legendary');
    expect(tierForScore(100).id).toBe('legendary');
  });
});
