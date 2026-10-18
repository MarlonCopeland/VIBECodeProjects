// src/screens/settings/RarityScreen.tsx
// Rarity color palettes — mirrors the phone's app/(app)/settings/rarity.tsx.
// Free palettes apply instantly; premium palettes are $1.99 cosmetic
// unlocks. Honest beta behavior: unlocking doesn't charge yet (real billing
// is TODO — paletteStore.ts) and the copy says so.

import { useState } from 'react';
import { CheckCircle2, Lock } from 'lucide-react';
import { PALETTE_STORE_ENABLED } from '@legend/config/env';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { PALETTES, type Palette } from '@legend/features/contacts/palettes';
import { purchasePalette } from '@legend/features/contacts/paletteStore';
import { TIER_SPECS } from '@legend/features/contacts/grading';
import { notify } from '@legend/lib/notify';
import { BackButton } from '../../app/router';
import { Button, Card, Page } from '../../ui/components';

export default function RarityScreen() {
  const { paletteId, setPaletteId, isPaletteUnlocked, unlockPalette } = useAppSettings();
  const [buying, setBuying] = useState<string | null>(null);

  const unlock = async (p: Palette) => {
    setBuying(p.id);
    try {
      const result = await purchasePalette(p.id);
      if (result.ok) {
        unlockPalette(p.id);
        setPaletteId(p.id);
        notify(result.beta ? 'Unlocked (beta)' : 'Unlocked', result.message);
      }
    } catch (e) {
      notify('Purchase failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBuying(null);
    }
  };

  return (
    <Page title="Rarity Colors" narrow back={<BackButton fallback="/settings" />}>
      <p className="muted" style={{ marginTop: 0, marginBottom: 'var(--s-lg)' }}>
        The colors your contacts' rarity tiers use everywhere — list dots, badges, filters, and the Network map.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--s-md)' }}>
        {PALETTES.map((p) => {
          const unlocked = isPaletteUnlocked(p);
          const active = paletteId === p.id;
          return (
            <Card
              key={p.id}
              style={{
                borderColor: active ? 'var(--primary)' : undefined,
                borderWidth: active ? 2 : undefined,
                borderStyle: active ? 'solid' : undefined,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div className="row">
                <div className="grow" style={{ fontWeight: 600 }}>
                  {p.name}
                  {p.animated ? '  ✦' : ''}
                </div>
                {active ? (
                  <span className="row small" style={{ gap: 4, color: 'var(--primary)', fontWeight: 600 }}>
                    <CheckCircle2 size={16} /> Active
                  </span>
                ) : p.premium && !unlocked ? (
                  <span className="row small muted" style={{ gap: 4 }}>
                    <Lock size={13} /> {PALETTE_STORE_ENABLED ? p.price : 'Coming soon'}
                  </span>
                ) : null}
              </div>

              <div className="small muted" style={{ marginTop: 2 }}>{p.description}</div>

              {/* Swatch strip */}
              <div className="row" style={{ gap: 6, marginTop: 'var(--s-md)' }}>
                {TIER_SPECS.map((spec) => (
                  <span
                    key={spec.id}
                    title={spec.label}
                    style={{ flex: 1, height: 22, borderRadius: 'var(--r-sm)', background: p.colors[spec.id] }}
                  />
                ))}
              </div>

              <div className="grow" />
              {active ? null : unlocked ? (
                <Button
                  title={`Use ${p.name}`}
                  variant="secondary"
                  block
                  style={{ marginTop: 'var(--s-md)' }}
                  onClick={() => setPaletteId(p.id)}
                />
              ) : PALETTE_STORE_ENABLED ? (
                <Button
                  title={`Unlock — ${p.price}`}
                  block
                  style={{ marginTop: 'var(--s-md)' }}
                  loading={buying === p.id}
                  onClick={() => void unlock(p)}
                />
              ) : null}
            </Card>
          );
        })}
      </div>

      <p className="small muted" style={{ marginTop: 'var(--s-lg)' }}>
        {PALETTE_STORE_ENABLED
          ? 'Premium palettes are free to unlock during beta — real billing arrives before launch.'
          : 'Premium palettes arrive with a future update.'}
      </p>
    </Page>
  );
}
