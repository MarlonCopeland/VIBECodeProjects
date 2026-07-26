// src/features/contacts/grading.ts
// The grading engine: converts a contact's interaction log into a
// freshness+strength score with a video-game rarity tier.
//
// Design (see TASKS.md "Grading engine"):
//   - Each interaction contributes  weight * 0.5^(ageDays / HALF_LIFE_DAYS).
//   - Score is the capped sum — so grades decay on their own as time passes,
//     with no cron or stored state. The interaction log is the truth.
//   - Pure functions only: `now` is always a parameter, so this is
//     deterministic and unit-testable.

import type { Interaction, InteractionKind } from './types';

export const INTERACTION_WEIGHTS: Record<InteractionKind, number> = {
  visit: 15,
  call: 10,
  premise: 8,
  text: 5,
  email: 4,
  note: 2,
};

/** Days for an interaction's contribution to lose half its value. */
export const HALF_LIFE_DAYS = 45;

export const MAX_SCORE = 100;

export type TierId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface TierSpec {
  id: TierId;
  label: string;
  /** Rarity color — the ONLY place rarity colors are defined. */
  color: string;
  /** Inclusive lower score bound. */
  min: number;
}

/** Ordered lowest → highest. */
export const TIER_SPECS: readonly TierSpec[] = [
  { id: 'common', label: 'Common', color: '#9AA2B1', min: 0 },
  { id: 'uncommon', label: 'Uncommon', color: '#2FBF71', min: 20 },
  { id: 'rare', label: 'Rare', color: '#4C8BF5', min: 40 },
  { id: 'epic', label: 'Epic', color: '#A855F7', min: 60 },
  { id: 'legendary', label: 'Legendary', color: '#F5A623', min: 80 },
] as const;

export const TIER_COLORS: Record<TierId, string> = Object.fromEntries(
  TIER_SPECS.map((t) => [t.id, t.color]),
) as Record<TierId, string>;

export interface Grade {
  /** 0–100, computed from the decayed interaction log. */
  score: number;
  tier: TierSpec;
  /** Whole days since the most recent interaction; null if none ever. */
  freshnessDays: number | null;
  lastInteractionAt: string | null;
}

const MS_PER_DAY = 86_400_000;

export function tierForScore(score: number): TierSpec {
  let tier: TierSpec = TIER_SPECS[0]!;
  for (const t of TIER_SPECS) {
    if (score >= t.min) tier = t;
  }
  return tier;
}

/** Decayed value of a single interaction at time `nowMs`. */
export function interactionValue(interaction: Interaction, nowMs: number): number {
  const ageDays = Math.max(0, (nowMs - Date.parse(interaction.occurredAt)) / MS_PER_DAY);
  return INTERACTION_WEIGHTS[interaction.kind] * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/**
 * Grade one contact from its interactions. Interactions for other contacts
 * may be passed; anything whose timestamp fails to parse is ignored.
 */
export function computeGrade(interactions: Interaction[], nowMs: number = Date.now()): Grade {
  let sum = 0;
  let lastMs = -Infinity;
  let lastIso: string | null = null;

  for (const it of interactions) {
    const ts = Date.parse(it.occurredAt);
    if (Number.isNaN(ts)) continue;
    sum += interactionValue(it, nowMs);
    if (ts > lastMs) {
      lastMs = ts;
      lastIso = it.occurredAt;
    }
  }

  const score = Math.min(MAX_SCORE, Math.round(sum));
  return {
    score,
    tier: tierForScore(score),
    freshnessDays: lastIso ? Math.max(0, Math.floor((nowMs - lastMs) / MS_PER_DAY)) : null,
    lastInteractionAt: lastIso,
  };
}

/** Human-readable freshness, e.g. "today", "3d ago", "5mo ago", "never". */
export function describeFreshness(freshnessDays: number | null): string {
  if (freshnessDays === null) return 'never';
  if (freshnessDays === 0) return 'today';
  if (freshnessDays === 1) return 'yesterday';
  if (freshnessDays < 30) return `${freshnessDays}d ago`;
  if (freshnessDays < 365) return `${Math.floor(freshnessDays / 30)}mo ago`;
  return `${Math.floor(freshnessDays / 365)}y ago`;
}

/** Points still needed to reach the next tier (null when Legendary). */
export function pointsToNextTier(score: number): { next: TierSpec; points: number } | null {
  const current = tierForScore(score);
  const idx = TIER_SPECS.findIndex((t) => t.id === current.id);
  const next = TIER_SPECS[idx + 1];
  return next ? { next, points: next.min - score } : null;
}
