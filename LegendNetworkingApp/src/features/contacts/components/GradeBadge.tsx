// src/features/contacts/components/GradeBadge.tsx
// The rarity indicator. `variant="dot"` is the compact list marker;
// `variant="pill"` shows tier name + score; `variant="hero"` is the big
// contact-detail treatment with freshness. When the active palette is
// animated (premium "Prismatic"), the hero badge shimmers through the
// rainbow — kept to `hero` only so long contact lists never animate.

import React from 'react';
import { View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { Text } from '../../../components/Text';
import { useTheme } from '../../../theme/ThemeProvider';
import { useAppSettings } from '../../settings/AppSettingsContext';
import { PRISMATIC_SWEEP } from '../palettes';
import { describeFreshness, type Grade } from '../grading';

interface GradeBadgeProps {
  grade: Grade;
  variant?: 'dot' | 'pill' | 'hero';
}

/** 15%-alpha tint of a hex color for pill backgrounds. */
function tint(hex: string): string {
  return `${hex}26`;
}

/** Hero badge with a looping rainbow shimmer (premium Prismatic palette). */
function AnimatedHero({ grade }: { grade: Grade }) {
  const { spacing, radius } = useTheme();
  const { tier, score, freshnessDays } = grade;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 4000 }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress]);

  const inputRange = PRISMATIC_SWEEP.map((_, i) => i / (PRISMATIC_SWEEP.length - 1));
  const containerStyle = useAnimatedStyle(() => {
    const color = interpolateColor(progress.value, inputRange, PRISMATIC_SWEEP as string[]);
    return { borderColor: color };
  });
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, inputRange, PRISMATIC_SWEEP as string[]),
  }));

  return (
    <Animated.View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: tint(tier.color),
          borderWidth: 2,
          borderRadius: radius.lg,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          alignItems: 'center',
        },
        containerStyle,
      ]}
    >
      <Animated.Text style={[{ fontSize: 20, fontWeight: '800' }, textStyle]}>
        {`✦ ${tier.label} ✦`}
      </Animated.Text>
      <Text variant="caption" style={{ color: tier.color }}>
        {`${score}/100 · last touch ${describeFreshness(freshnessDays)}`}
      </Text>
    </Animated.View>
  );
}

export function GradeBadge({ grade, variant = 'pill' }: GradeBadgeProps) {
  const { spacing, radius } = useTheme();
  const { activePalette } = useAppSettings();
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
    if (activePalette.animated) return <AnimatedHero grade={grade} />;
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
