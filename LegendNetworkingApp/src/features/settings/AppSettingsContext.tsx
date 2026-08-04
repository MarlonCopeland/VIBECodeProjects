// src/features/settings/AppSettingsContext.tsx
// Persisted app-level preferences that aren't part of the contact data:
// which contact is "me", bulk-outreach exclusion, the Contacts default view,
// the user-tunable GRADING config (weights, decay, tier thresholds, color
// palette + premium entitlements), and saved outreach message templates.
// Stored as one JSON blob in the non-sensitive key/value store.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../../lib/storage';
import type { Contact, InteractionKind } from '../contacts/types';
import {
  HALF_LIFE_DAYS,
  INTERACTION_WEIGHTS,
  TIER_SPECS,
  type GradingConfig,
  type InteractionWeights,
  type TierId,
} from '../contacts/grading';
import { DEFAULT_PALETTE_ID, paletteById, type Palette } from '../contacts/palettes';

const STORE_KEY = 'legend.appSettings';

export type ContactsDefaultView = 'all' | 'recent';

export interface MessageTemplate {
  id: string;
  name: string;
  channel: 'text' | 'email';
  /** Email only. */
  subject?: string;
  body: string;
}

export interface AppSettings {
  meContactId: string | null;
  excludeMeFromBulk: boolean;
  contactsDefaultView: ContactsDefaultView;
  /** First-run tutorial has been completed (or skipped). */
  hasSeenTutorial: boolean;
  /** Sync opt-in for THIS device (meaningful only with an active sync sub). */
  syncEnabled: boolean;

  // ---- Grading (all user-tunable) ----
  gradingWeights: InteractionWeights;
  halfLifeDays: number;
  decayEnabled: boolean;
  tierThresholds: Record<TierId, number>;
  paletteId: string;
  /** Premium palette ids the user owns. */
  unlockedPalettes: string[];

  // ---- Outreach ----
  templates: MessageTemplate[];
}

const DEFAULT_THRESHOLDS = Object.fromEntries(TIER_SPECS.map((t) => [t.id, t.min])) as Record<TierId, number>;

const SEED_TEMPLATES: MessageTemplate[] = [
  { id: 'seed-checkin', name: 'Check-in', channel: 'text', body: "Hey {first}, it's been a minute — how have you been?" },
  {
    id: 'seed-coffee',
    name: 'Coffee invite',
    channel: 'email',
    subject: 'Catching up?',
    body: 'Hi {first},\n\nIt would be great to reconnect — any chance you are free for a coffee soon?\n\nBest,',
  },
];

const DEFAULTS: AppSettings = {
  meContactId: null,
  excludeMeFromBulk: true,
  contactsDefaultView: 'all',
  hasSeenTutorial: false,
  syncEnabled: false,
  gradingWeights: { ...INTERACTION_WEIGHTS },
  halfLifeDays: HALF_LIFE_DAYS,
  decayEnabled: true,
  tierThresholds: { ...DEFAULT_THRESHOLDS },
  paletteId: DEFAULT_PALETTE_ID,
  unlockedPalettes: [],
  templates: SEED_TEMPLATES,
};

/** Defaults that "Reset grading" restores (leaves entitlements + templates). */
const GRADING_DEFAULTS = {
  gradingWeights: { ...INTERACTION_WEIGHTS },
  halfLifeDays: HALF_LIFE_DAYS,
  decayEnabled: true,
  tierThresholds: { ...DEFAULT_THRESHOLDS },
  paletteId: DEFAULT_PALETTE_ID,
};

interface AppSettingsValue extends AppSettings {
  ready: boolean;

  setMeContactId: (id: string | null) => void;
  setExcludeMeFromBulk: (on: boolean) => void;
  setContactsDefaultView: (view: ContactsDefaultView) => void;
  setHasSeenTutorial: (seen: boolean) => void;
  setSyncEnabled: (on: boolean) => void;
  applyMeExclusion: (contacts: Contact[]) => Contact[];

  // Grading
  /** Resolved, sorted config for the grading engine + colors. */
  gradingConfig: GradingConfig;
  /** The active palette (for animation flags etc.). */
  activePalette: Palette;
  setWeight: (kind: InteractionKind, value: number) => void;
  setHalfLifeDays: (days: number) => void;
  setDecayEnabled: (on: boolean) => void;
  setTierThreshold: (tier: TierId, value: number) => void;
  setPaletteId: (id: string) => void;
  unlockPalette: (id: string) => void;
  isPaletteUnlocked: (p: Palette) => boolean;
  resetGrading: () => void;

  // Templates
  addTemplate: (t: Omit<MessageTemplate, 'id'>) => void;
  updateTemplate: (id: string, patch: Partial<Omit<MessageTemplate, 'id'>>) => void;
  removeTemplate: (id: string) => void;
}

const AppSettingsContext = createContext<AppSettingsValue | undefined>(undefined);

function genId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void storage.getItem(STORE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<AppSettings>;
          setSettings({
            ...DEFAULTS,
            ...parsed,
            // Deep-merge the nested records so a partial/old blob still gets
            // every weight and threshold from defaults.
            gradingWeights: { ...DEFAULTS.gradingWeights, ...(parsed.gradingWeights ?? {}) },
            tierThresholds: { ...DEFAULTS.tierThresholds, ...(parsed.tierThresholds ?? {}) },
            templates: parsed.templates ?? DEFAULTS.templates,
          });
        } catch {
          /* corrupt blob — fall back to defaults */
        }
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void storage.setItem(STORE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo<AppSettingsValue>(() => {
    const palette = paletteById(settings.paletteId);
    // Merge live colors + thresholds onto the canonical tier specs, sorted
    // ascending by threshold so tierForScore stays correct even if the user
    // sets thresholds out of order.
    const tiers = TIER_SPECS.map((spec) => ({
      ...spec,
      color: palette.colors[spec.id],
      min: settings.tierThresholds[spec.id] ?? spec.min,
    })).sort((a, b) => a.min - b.min);

    const gradingConfig: GradingConfig = {
      weights: settings.gradingWeights,
      halfLifeDays: settings.halfLifeDays,
      decayEnabled: settings.decayEnabled,
      tiers,
    };

    const isPaletteUnlocked = (p: Palette) => !p.premium || settings.unlockedPalettes.includes(p.id);

    return {
      ...settings,
      ready,
      gradingConfig,
      activePalette: palette,

      setMeContactId: (id) => update({ meContactId: id }),
      setExcludeMeFromBulk: (on) => update({ excludeMeFromBulk: on }),
      setContactsDefaultView: (view) => update({ contactsDefaultView: view }),
      setHasSeenTutorial: (seen) => update({ hasSeenTutorial: seen }),
      setSyncEnabled: (on) => update({ syncEnabled: on }),
      applyMeExclusion: (contacts) =>
        settings.excludeMeFromBulk && settings.meContactId
          ? contacts.filter((c) => c.id !== settings.meContactId)
          : contacts,

      setWeight: (kind, v) =>
        update({ gradingWeights: { ...settings.gradingWeights, [kind]: v } }),
      setHalfLifeDays: (days) => update({ halfLifeDays: days }),
      setDecayEnabled: (on) => update({ decayEnabled: on }),
      setTierThreshold: (tier, v) =>
        update({ tierThresholds: { ...settings.tierThresholds, [tier]: v } }),
      setPaletteId: (id) => {
        const p = paletteById(id);
        if (isPaletteUnlocked(p)) update({ paletteId: id });
      },
      unlockPalette: (id) =>
        update({
          unlockedPalettes: settings.unlockedPalettes.includes(id)
            ? settings.unlockedPalettes
            : [...settings.unlockedPalettes, id],
        }),
      isPaletteUnlocked,
      resetGrading: () => update({ ...GRADING_DEFAULTS }),

      addTemplate: (t) => update({ templates: [...settings.templates, { ...t, id: genId() }] }),
      updateTemplate: (id, patch) =>
        update({ templates: settings.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      removeTemplate: (id) => update({ templates: settings.templates.filter((t) => t.id !== id) }),
    };
  }, [settings, ready, update]);

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsValue {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}
