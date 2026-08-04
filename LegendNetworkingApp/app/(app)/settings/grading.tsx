// app/(app)/settings/grading.tsx
// Grading & scoring settings: per-interaction point weights and the score-
// reduction controls (decay half-life, per-tier score thresholds, and a
// disable-decay toggle). Everything re-grades the whole network live.

import React from 'react';
import { Switch, View } from 'react-native';
import { Stack } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { Stepper } from '../../../src/components/Stepper';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAppSettings } from '../../../src/features/settings/AppSettingsContext';
import { confirm } from '../../../src/lib/notify';
import type { InteractionKind } from '../../../src/features/contacts/types';

const WEIGHT_ROWS: { kind: InteractionKind; label: string }[] = [
  { kind: 'visit', label: 'Visit / in person' },
  { kind: 'call', label: 'Call' },
  { kind: 'premise', label: 'Premise (their event/space)' },
  { kind: 'text', label: 'Text' },
  { kind: 'email', label: 'Email' },
  { kind: 'note', label: 'Note' },
];

export default function GradingSettingsScreen() {
  const { spacing, colors } = useTheme();
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
    <Screen scroll>
      <Stack.Screen options={{ title: 'Grading & Scoring' }} />

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        INTERACTION WEIGHTS
      </Text>
      <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
        How many points each kind of touch adds to a contact's score.
      </Text>
      <Card style={{ marginBottom: spacing.xl }}>
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

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        SCORE REDUCTION
      </Text>
      <Card style={{ marginBottom: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text weight="semibold">Fade untouched contacts</Text>
            <Text variant="caption" tone="muted">
              When on, scores decay over time so stale relationships drop tiers. When off, scores only ever climb.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Fade untouched contacts over time"
            value={decayEnabled}
            onValueChange={setDecayEnabled}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
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

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        TIER THRESHOLDS
      </Text>
      <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
        The score where each rarity begins (0–100). Raise Legendary to make it rarer.
      </Text>
      <Card style={{ marginBottom: spacing.xl }}>
        {gradingConfig.tiers.map((tier) => (
          <View key={tier.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tier.color }} />
            <View style={{ flex: 1 }}>
              <Stepper
                label={tier.label}
                value={tier.min}
                onChange={(v) => setTierThreshold(tier.id, v)}
                min={0}
                max={100}
                step={5}
              />
            </View>
          </View>
        ))}
      </Card>

      <Button
        title="Reset grading to defaults"
        variant="secondary"
        onPress={() =>
          confirm(
            'Reset grading?',
            'Restores default weights, decay, thresholds, and the Classic palette. Your unlocked palettes and templates are kept.',
            resetGrading,
          )
        }
      />
    </Screen>
  );
}
