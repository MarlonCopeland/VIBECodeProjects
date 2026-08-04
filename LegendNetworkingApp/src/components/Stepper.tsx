// src/components/Stepper.tsx
// Themed −/＋ number stepper for the grading settings (weights, half-life,
// tier thresholds). Clamps to [min, max] and holds a tabular-figure value so
// the row doesn't jitter as digits change.

import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeProvider';

interface StepperProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  hint,
}: StepperProps) {
  const { colors, spacing, radius } = useTheme();

  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const set = (n: number) => {
    const c = clamp(n);
    if (c !== value) onChange(c);
  };

  const btn = (icon: 'remove' | 'add', delta: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${icon === 'add' ? 'Increase' : 'Decrease'} ${label}`}
      disabled={disabled}
      onPress={() => set(value + delta)}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Ionicons name={icon} size={18} color={colors.primary} />
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <Text weight="semibold">{label}</Text>
        {hint ? <Text variant="caption" tone="muted">{hint}</Text> : null}
      </View>
      {btn('remove', -step, value <= min)}
      <Text
        weight="semibold"
        style={{ minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] }}
      >
        {`${value}${suffix ?? ''}`}
      </Text>
      {btn('add', step, value >= max)}
    </View>
  );
}
