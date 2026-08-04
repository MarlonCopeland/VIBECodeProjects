// src/features/payments/tiers.ts
// Declarative subscription catalog. Edit this to define an app's plans; price
// IDs come from config (Stripe dashboard) so the catalog stays code-safe.

import { STRIPE_PRICE_IDS } from '../../config/env';
import type { Tier } from './types';

export const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    priceLabel: '$0',
    features: ['Core features', 'Community support'],
    priceId: '',
  },
  {
    id: 'tier1',
    name: 'Pro',
    priceLabel: '$9/mo',
    features: ['Everything in Free', 'Priority support', 'Advanced features'],
    priceId: STRIPE_PRICE_IDS.tier1,
  },
  {
    id: 'tier2',
    name: 'Team',
    priceLabel: '$29/mo',
    features: ['Everything in Pro', 'Team seats', 'Admin controls'],
    priceId: STRIPE_PRICE_IDS.tier2,
  },
];

export function getTier(id: string): Tier | undefined {
  return TIERS.find((t) => t.id === id);
}
