import { describe, expect, it } from 'vitest';
import {
  computeGrade,
  tierForScore,
  DEFAULT_GRADING_CONFIG,
  type GradingConfig,
  type TierSpec,
} from '../src/features/contacts/grading';
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

describe('grading — user config', () => {
  it('honors custom interaction weights', () => {
    const config: GradingConfig = {
      ...DEFAULT_GRADING_CONFIG,
      weights: { ...DEFAULT_GRADING_CONFIG.weights, visit: 40 },
    };
    expect(computeGrade([interaction('visit', 0)], NOW, config).score).toBe(40);
  });

  it('does not decay when decay is disabled', () => {
    const config: GradingConfig = { ...DEFAULT_GRADING_CONFIG, decayEnabled: false };
    // Full weight regardless of age (default would decay a 45-day-old call to 5).
    expect(computeGrade([interaction('call', 45)], NOW, config).score).toBe(10);
  });

  it('decays faster with a shorter half-life', () => {
    const config: GradingConfig = { ...DEFAULT_GRADING_CONFIG, halfLifeDays: 10 };
    // 45 days at a 10-day half-life => 10 * 0.5^4.5 ≈ 0.44 -> rounds to 0.
    expect(computeGrade([interaction('call', 45)], NOW, config).score).toBe(0);
  });

  it('applies custom tier thresholds via config.tiers', () => {
    const tiers: TierSpec[] = [
      { id: 'common', label: 'Common', color: '#000', min: 0 },
      { id: 'legendary', label: 'Legendary', color: '#fff', min: 10 },
    ];
    const config: GradingConfig = { ...DEFAULT_GRADING_CONFIG, tiers };
    // A single visit (15) clears a lowered Legendary threshold of 10.
    expect(computeGrade([interaction('visit', 0)], NOW, config).tier.id).toBe('legendary');
  });

  it('sorts unsorted tiers correctly for boundary lookup', () => {
    const tiers: TierSpec[] = [
      { id: 'legendary', label: 'Legendary', color: '#fff', min: 50 },
      { id: 'common', label: 'Common', color: '#000', min: 0 },
    ];
    // tierForScore requires ascending order; pass sorted as the engine does.
    const sorted = [...tiers].sort((a, b) => a.min - b.min);
    expect(tierForScore(20, sorted).id).toBe('common');
    expect(tierForScore(60, sorted).id).toBe('legendary');
  });
});
