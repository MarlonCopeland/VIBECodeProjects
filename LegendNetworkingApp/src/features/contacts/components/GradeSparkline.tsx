// src/features/contacts/components/GradeSparkline.tsx
// A tiny line of the contact's score over the last ~6 months (weekly samples
// from gradeHistory), drawn with react-native-svg, already a dependency via
// the profile QR code. The y axis is fixed at 0..MAX_SCORE rather than
// auto-scaled, so a flat line near the bottom honestly reads as "cold", not
// as a dramatic wiggle. Tier thresholds are drawn as faint guide lines.

import React from 'react';
import { View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { Text } from '../../../components/Text';
import { useTheme } from '../../../theme/ThemeProvider';
import { MAX_SCORE, type GradeHistoryPoint, type TierSpec } from '../grading';

interface Props {
  history: GradeHistoryPoint[];
  color: string;
  tiers: readonly TierSpec[];
  width?: number;
  height?: number;
}

export function GradeSparkline({ history, color, tiers, width = 220, height = 40 }: Props) {
  const { colors, spacing } = useTheme();
  if (history.length < 2) return null;
  const pad = 2;
  const x = (i: number) => pad + (i / (history.length - 1)) * (width - pad * 2);
  const y = (score: number) => pad + (1 - Math.min(score, MAX_SCORE) / MAX_SCORE) * (height - pad * 2);
  const points = history.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const first = history[0]!.score;
  const last = history[history.length - 1]!.score;
  const delta = last - first;

  return (
    <View
      accessible
      accessibilityLabel={`Score over the last six months: from ${first} to ${last}`}
      style={{ marginTop: spacing.sm, alignItems: 'center' }}
    >
      <Svg width={width} height={height}>
        {tiers
          .filter((t) => t.min > 0 && t.min < MAX_SCORE)
          .map((t) => (
            <Line
              key={t.id}
              x1={pad}
              x2={width - pad}
              y1={y(t.min)}
              y2={y(t.min)}
              stroke={colors.border}
              strokeWidth={1}
              strokeDasharray="2,3"
            />
          ))}
        <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
      <Text variant="caption" tone="muted">
        {`6 months · ${delta === 0 ? 'steady' : delta > 0 ? `up ${delta}` : `down ${-delta}`}`}
      </Text>
    </View>
  );
}
