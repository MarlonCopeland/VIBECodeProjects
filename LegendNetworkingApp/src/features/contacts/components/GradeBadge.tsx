// src/features/contacts/components/GradeBadge.tsx
// The rarity indicator. `variant="dot"` is the compact list marker;
// `variant="pill"` shows tier name + score; `variant="hero"` is the big
// contact-detail treatment with freshness.

import React from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/Text';
import { useTheme } from '../../../theme/ThemeProvider';
import { describeFreshness, type Grade } from '../grading';

interface GradeBadgeProps {
  grade: Grade;
  variant?: 'dot' | 'pill' | 'hero';
}

/** 15%-alpha tint of a hex color for pill backgrounds. */
function tint(hex: string): string {
  return `${hex}26`;
}

export function GradeBadge({ grade, variant = 'pill' }: GradeBadgeProps) {
  const { spacing, radius } = useTheme();
  const { tier, score, freshnessDays } = grade;

  if (variant === 'dot') {
    return (
      <View
        accessibilityLabel={`${tier.label}, score ${score}`}
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: tier.color,
        }}
      />
    );
  }

  if (variant === 'hero') {
    return (
      <View
        style={{
          alignSelf: 'flex-start',
          backgroundColor: tint(tier.color),
          borderColor: tier.color,
          borderWidth: 1.5,
          borderRadius: radius.lg,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          alignItems: 'center',
        }}
      >
        <Text variant="heading" weight="bold" style={{ color: tier.color }}>
          {tier.label}
        </Text>
        <Text variant="caption" style={{ color: tier.color }}>
          {`${score}/100 · last touch ${describeFreshness(freshnessDays)}`}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: tint(tier.color),
        borderRadius: radius.pill,
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
        gap: 6,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tier.color }} />
      <Text variant="caption" weight="semibold" style={{ color: tier.color }}>
        {`${tier.label} ${score}`}
      </Text>
    </View>
  );
}
