// src/screens/settings/GradingScreen.tsx
// Grading & scoring settings — mirrors the phone's
// app/(app)/settings/grading.tsx: per-interaction point weights and the
// score-reduction controls (decay half-life, per-tier thresholds, and a
// disable-decay toggle). Everything re-grades the whole network live.
// The phone's −/＋ Stepper is re-created locally; on desktop the value is
// also typeable.

import { useEffect, useState, type CSSProperties } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import type { InteractionKind } from '@legend/features/contacts/types';
import { confirm } from '@legend/lib/notify';
import { BackButton } from '../../app/router';
import { Button, Card, Page, SectionLabel, Toggle } from '../../ui/components';

const WEIGHT_ROWS: { kind: InteractionKind; label: string }[] = [
  { kind: 'visit', label: 'Visit / in person' },
  { kind: 'call', label: 'Call' },
  { kind: 'premise', label: 'Premise (their event/space)' },
  { kind: 'text', label: 'Text' },
  { kind: 'email', label: 'Email' },
  { kind: 'note', label: 'Note' },
];

const stepBtn: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--primary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

/** −/＋ number stepper clamped to [min, max]; the value can also be typed. */
function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const set = (n: number) => {
    const c = Math.max(min, Math.min(max, Math.round(n)));
    if (c !== value) onChange(c);
    setText(String(c));
  };
  const commit = () => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) setText(String(value));
    else set(n);
  };

  return (
    <div className="row" style={{ gap: 'var(--s-md)', padding: 'var(--s-sm) 0' }}>
      <div className="grow">
        <div style={{ fontWeight: 600 }}>{label}</div>
        {hint ? <div className="small muted">{hint}</div> : null}
      </div>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => set(value - step)}
        style={{ ...stepBtn, opacity: value <= min ? 0.4 : 1 }}
      >
        <Minus size={16} />
      </button>
      <div className="row" style={{ gap: 2 }}>
        <input
          className="input"
          aria-label={label}
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'ArrowUp') {
              e.preventDefault();
              set(value + step);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              set(value - step);
            }
          }}
          style={{ width: 56, textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums', padding: '6px 4px' }}
        />
        {suffix ? <span className="muted small">{suffix}</span> : null}
      </div>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => set(value + step)}
        style={{ ...stepBtn, opacity: value >= max ? 0.4 : 1 }}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

export default function GradingScreen() {
  const {
    gradingWeights,
    setWeight,
    halfLifeDays,
    setHalfLifeDays,
    decayEnabled,
    setDecayEnabled,
    gradingConfig,
    setTierThreshold,
    resetGrading,
  } = useAppSettings();

  return (
    <Page title="Grading & Scoring" narrow back={<BackButton fallback="/settings" />}>
      <SectionLabel style={{ marginBottom: 'var(--s-xs)' }}>Interaction weights</SectionLabel>
      <div className="small muted" style={{ marginBottom: 'var(--s-sm)' }}>
        How many points each kind of touch adds to a contact's score.
      </div>
      <Card style={{ marginBottom: 'var(--s-xl)' }}>
        {WEIGHT_ROWS.map((row) => (
          <Stepper
            key={row.kind}
            label={row.label}
            value={gradingWeights[row.kind]}
            onChange={(v) => setWeight(row.kind, v)}
            min={0}
            max={50}
          />
        ))}
      </Card>

      <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Score reduction</SectionLabel>
      <Card style={{ marginBottom: 'var(--s-xl)' }}>
        <div className="row" style={{ gap: 'var(--s-md)', paddingBottom: 'var(--s-sm)' }}>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>Fade untouched contacts</div>
            <div className="small muted">
              When on, scores decay over time so stale relationships drop tiers. When off, scores only ever climb.
            </div>
          </div>
          <Toggle label="Fade untouched contacts over time" on={decayEnabled} onChange={setDecayEnabled} />
        </div>
        {decayEnabled ? (
          <Stepper
            label="Decay half-life"
            hint="Days for a touch to lose half its value. Lower = fades faster."
            value={halfLifeDays}
            onChange={setHalfLifeDays}
            min={5}
            max={365}
            step={5}
            suffix="d"
          />
        ) : null}
      </Card>

      <SectionLabel style={{ marginBottom: 'var(--s-xs)' }}>Tier thresholds</SectionLabel>
      <div className="small muted" style={{ marginBottom: 'var(--s-sm)' }}>
        The score where each rarity begins (0–100). Raise Legendary to make it rarer.
      </div>
      <Card style={{ marginBottom: 'var(--s-xl)' }}>
        {gradingConfig.tiers.map((tier) => (
          <div key={tier.id} className="row">
            <span style={{ width: 12, height: 12, borderRadius: 6, background: tier.color, flexShrink: 0 }} />
            <div className="grow">
              <Stepper
                label={tier.label}
                value={tier.min}
                onChange={(v) => setTierThreshold(tier.id, v)}
                min={0}
                max={100}
                step={5}
              />
            </div>
          </div>
        ))}
      </Card>

      <Button
        title="Reset grading to defaults"
        variant="secondary"
        block
        onClick={() =>
          confirm(
            'Reset grading?',
            'Restores default weights, decay, thresholds, and the Classic palette. Your unlocked palettes and templates are kept.',
            resetGrading,
          )
        }
      />
    </Page>
  );
}
