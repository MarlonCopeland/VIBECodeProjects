// src/features/demo/mockData.ts
// Canned vendors, deals, coupons, and live alerts for the animation demo
// screens. Nothing here touches the backend — the demos run identically on
// the local and Supabase backends, signed in as anyone.

import type { VendorType } from '../../backend/types';

export interface DemoVendor {
  id: string;
  name: string;
  emoji: string;
  type: VendorType;
  tagline: string;
  /** Per-vendor accent used for hero gradients and badges (demo data, not theme). */
  accent: string;
  rating: number;
  distanceKm: number;
  isOpen: boolean;
  isNew: boolean;
  hotDeal?: DemoDeal;
  coupons: DemoCoupon[];
}

export interface DemoDeal {
  title: string;
  /** Prices in cents. */
  originalPrice: number;
  salePrice: number;
  /** Seconds from screen open until the deal ends. */
  endsInSec: number;
  claimed: number;
  stock: number;
}

export interface DemoCoupon {
  id: string;
  headline: string;
  detail: string;
  code: string;
}

export type DemoAlertKind = 'opened' | 'new' | 'deal';

export interface DemoAlert {
  id: string;
  kind: DemoAlertKind;
  vendorId: string;
  message: string;
}

export const DEMO_VENDORS: DemoVendor[] = [
  {
    id: 'taco-loco',
    name: 'Taco Loco',
    emoji: '🌮',
    type: 'Food',
    tagline: 'Birria tacos, hand-pressed tortillas',
    accent: '#F97316',
    rating: 4.8,
    distanceKm: 0.4,
    isOpen: true,
    isNew: false,
    hotDeal: {
      title: '3 Birria Tacos + Consommé',
      originalPrice: 1400,
      salePrice: 899,
      endsInSec: 60 * 47 + 12,
      claimed: 38,
      stock: 50,
    },
    coupons: [
      { id: 'c1', headline: 'Free horchata', detail: 'With any 3-taco plate', code: 'HORCHATA' },
      { id: 'c2', headline: '20% off', detail: 'Orders over $25', code: 'LOCO20' },
      { id: 'c3', headline: 'BOGO quesadilla', detail: 'Tuesdays only', code: 'QUESOTUES' },
    ],
  },
  {
    id: 'bean-there',
    name: 'Bean There',
    emoji: '☕',
    type: 'Food',
    tagline: 'Cold brew on wheels',
    accent: '#A16207',
    rating: 4.6,
    distanceKm: 0.9,
    isOpen: true,
    isNew: true,
    hotDeal: {
      title: 'Any large cold brew',
      originalPrice: 650,
      salePrice: 400,
      endsInSec: 60 * 18 + 40,
      claimed: 71,
      stock: 80,
    },
    coupons: [{ id: 'c1', headline: 'Free pastry', detail: 'First visit', code: 'HELLOBEAN' }],
  },
  {
    id: 'thread-lab',
    name: 'Thread Lab',
    emoji: '🧵',
    type: 'Clothes',
    tagline: 'Vintage tees & custom patches',
    accent: '#8B5CF6',
    rating: 4.9,
    distanceKm: 1.6,
    isOpen: false,
    isNew: true,
    coupons: [{ id: 'c1', headline: '$10 off', detail: 'Any jacket', code: 'PATCHUP' }],
  },
  {
    id: 'glow-arcade',
    name: 'Glow Arcade',
    emoji: '🕹️',
    type: 'Activity',
    tagline: 'Retro cabinets, neon everything',
    accent: '#EC4899',
    rating: 4.7,
    distanceKm: 2.3,
    isOpen: true,
    isNew: false,
    hotDeal: {
      title: 'Unlimited play — 1 hour',
      originalPrice: 2000,
      salePrice: 1200,
      endsInSec: 60 * 60 * 2 + 5,
      claimed: 12,
      stock: 40,
    },
    coupons: [
      { id: 'c1', headline: '10 free tokens', detail: 'Show at the booth', code: 'INSERTCOIN' },
      { id: 'c2', headline: 'Kids play free', detail: 'With paying adult', code: 'PLAYER2' },
    ],
  },
  {
    id: 'fix-it',
    name: 'Fix-It Fast',
    emoji: '🔧',
    type: 'Electronics',
    tagline: 'Phone screens in 20 minutes',
    accent: '#0EA5E9',
    rating: 4.5,
    distanceKm: 3.1,
    isOpen: true,
    isNew: false,
    coupons: [{ id: 'c1', headline: 'Free diagnostic', detail: 'Any device', code: 'DIAGNOSE' }],
  },
  {
    id: 'clay-day',
    name: 'Clay Day',
    emoji: '🏺',
    type: 'Arts',
    tagline: 'Pottery wheel drop-ins',
    accent: '#14B8A6',
    rating: 4.9,
    distanceKm: 3.8,
    isOpen: false,
    isNew: true,
    hotDeal: {
      title: 'Wheel session for two',
      originalPrice: 6000,
      salePrice: 3900,
      endsInSec: 60 * 9 + 30,
      claimed: 9,
      stock: 10,
    },
    coupons: [],
  },
  {
    id: 'sweet-cheeks',
    name: 'Sweet Cheeks',
    emoji: '🍩',
    type: 'Food',
    tagline: 'Mini donuts, made to order',
    accent: '#F43F5E',
    rating: 4.4,
    distanceKm: 4.5,
    isOpen: true,
    isNew: false,
    coupons: [{ id: 'c1', headline: 'Dozen for $5', detail: 'After 8pm', code: 'LATENIGHT' }],
  },
];

/** Alerts the home demo cycles through, as if they arrived live. */
export const DEMO_ALERTS: DemoAlert[] = [
  { id: 'a1', kind: 'opened', vendorId: 'taco-loco', message: 'just opened 0.4 km away' },
  { id: 'a2', kind: 'new', vendorId: 'bean-there', message: 'is new in your area' },
  { id: 'a3', kind: 'deal', vendorId: 'clay-day', message: 'dropped a flash deal — 35% off' },
  { id: 'a4', kind: 'opened', vendorId: 'glow-arcade', message: 'just opened 2.3 km away' },
  { id: 'a5', kind: 'new', vendorId: 'thread-lab', message: 'set up shop nearby' },
];

export function getDemoVendor(id: string | undefined): DemoVendor | undefined {
  return DEMO_VENDORS.find((v) => v.id === id);
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
