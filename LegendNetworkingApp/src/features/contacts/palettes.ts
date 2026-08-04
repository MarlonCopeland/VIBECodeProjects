// src/features/contacts/palettes.ts
// Rarity-tier color palettes. Free palettes ship for everyone; premium
// palettes are $1.99 cosmetic unlocks (entitlements tracked in
// AppSettingsContext.unlockedPalettes). One premium palette ("Prismatic")
// animates — GradeBadge reads `animated` to shimmer the hero badge.
//
// NOTE: real charging requires StoreKit In-App Purchase + App Store Connect
// products (iOS forbids selling digital goods via Stripe). Until that lands,
// unlocks are free-in-beta — see src/features/contacts/paletteStore.ts.

import type { TierId } from './grading';

export interface Palette {
  id: string;
  name: string;
  description: string;
  premium: boolean;
  /** Display price for premium palettes (App Store tier). */
  price?: string;
  /** Rainbow/shine animation on the hero grade badge. */
  animated?: boolean;
  colors: Record<TierId, string>;
}

export const DEFAULT_PALETTE_ID = 'classic';

export const PALETTES: readonly Palette[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'The original loot-drop rarity colors.',
    premium: false,
    colors: { common: '#9AA2B1', uncommon: '#2FBF71', rare: '#4C8BF5', epic: '#A855F7', legendary: '#F5A623' },
  },
  {
    id: 'colorblind',
    name: 'Colorblind-friendly',
    description: 'Teal→blue→orange→yellow — no red/green confusion.',
    premium: false,
    colors: { common: '#9AA2B1', uncommon: '#12A5A0', rare: '#3A7BD5', epic: '#E08A1E', legendary: '#EFCE12' },
  },
  {
    id: 'mono',
    name: 'Monochrome',
    description: 'A single indigo ramp, light to deep.',
    premium: false,
    colors: { common: '#C7CCD6', uncommon: '#9AA6C6', rare: '#6E7FB6', epic: '#4C5C9E', legendary: '#2E3A78' },
  },
  // ---- Premium ($1.99 each) ------------------------------------------------
  {
    id: 'neon',
    name: 'Neon',
    description: 'Electric arcade glow.',
    premium: true,
    price: '$1.99',
    colors: { common: '#6B7280', uncommon: '#00E5A0', rare: '#00C2FF', epic: '#C13BFF', legendary: '#FF3D8B' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm dusk gradient tones.',
    premium: true,
    price: '$1.99',
    colors: { common: '#8A8598', uncommon: '#F4A259', rare: '#F25C54', epic: '#C1449C', legendary: '#7B2FF7' },
  },
  {
    id: 'prismatic',
    name: 'Prismatic',
    description: 'Shiny, reflective — the legendary badge shimmers through the rainbow.',
    premium: true,
    price: '$1.99',
    animated: true,
    colors: { common: '#A6ADBB', uncommon: '#39D8C6', rare: '#4C8BF5', epic: '#B06BFF', legendary: '#FFC24B' },
  },
];

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

/** Hues the Prismatic animation sweeps through (roygbiv-ish). */
export const PRISMATIC_SWEEP = ['#FF3D6E', '#FFB03A', '#FFE24B', '#39D8A0', '#4C8BF5', '#B06BFF', '#FF3D6E'];
