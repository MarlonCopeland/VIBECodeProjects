import { describe, expect, it } from 'vitest';
import {
  computeGrade,
  gradeHistory,
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

describe('gradeHistory', () => {
  it('samples weekly up to now, oldest first, ending at the current score', () => {
    const log = [interaction('visit', 3), interaction('call', 40), interaction('text', 100)];
    const h = gradeHistory(log, NOW, DEFAULT_GRADING_CONFIG);
    expect(h).toHaveLength(27);
    expect(h[26]!.atMs).toBe(NOW);
    expect(h[0]!.atMs).toBe(NOW - 26 * 7 * 86_400_000);
    expect(h[26]!.score).toBe(computeGrade(log, NOW, DEFAULT_GRADING_CONFIG).score);
    for (let i = 1; i < h.length; i++) expect(h[i]!.atMs - h[i - 1]!.atMs).toBe(7 * 86_400_000);
  });

  it('leaves later interactions out of earlier samples', () => {
    // Only a visit 3 days ago: every sample before it must be 0, not 15.
    const h = gradeHistory([interaction('visit', 3)], NOW, DEFAULT_GRADING_CONFIG, { points: 4, stepDays: 7 });
    expect(h.map((p) => p.score)).toEqual([0, 0, 0, computeGrade([interaction('visit', 3)], NOW).score]);
  });

  it('shows decay between touches and honours custom options and config', () => {
    const log = [interaction('visit', 60)];
    const h = gradeHistory(log, NOW, DEFAULT_GRADING_CONFIG, { points: 3, stepDays: 30 });
    // 60d ago: fresh 15; 30d later: decayed; now: decayed further.
    expect(h[0]!.score).toBe(15);
    expect(h[1]!.score).toBeLessThan(15);
    expect(h[2]!.score).toBeLessThan(h[1]!.score);
    const flat = gradeHistory(log, NOW, { ...DEFAULT_GRADING_CONFIG, decayEnabled: false }, { points: 3, stepDays: 30 });
    expect(flat.map((p) => p.score)).toEqual([15, 15, 15]);
    expect(gradeHistory([], NOW, DEFAULT_GRADING_CONFIG, { points: 0 })).toEqual([{ atMs: NOW, score: 0 }]);
  });
});
