// src/components/Text.tsx
// Themed typography primitive. Pick a `variant` instead of setting fontSize/
// weight/color by hand so text stays consistent across the app.

import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
type Tone = 'default' | 'muted' | 'primary' | 'danger' | 'inverse';

interface AppTextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  center?: boolean;
}

export function Text({
  variant = 'body',
  tone = 'default',
  weight,
  center,
  style,
  ...rest
}: AppTextProps) {
  const { colors, fontSize, fontWeight } = useTheme();

  const variantStyle = {
    display: { fontSize: fontSize.display, fontWeight: fontWeight.bold },
    title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
    heading: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
    body: { fontSize: fontSize.md, fontWeight: fontWeight.regular },
    label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
    caption: { fontSize: fontSize.xs, fontWeight: fontWeight.regular },
  }[variant];

  const toneColor = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primary,
    danger: colors.danger,
    inverse: colors.textInverse,
  }[tone];

  return (
    <RNText
      {...rest}
      style={[
        variantStyle,
        { color: toneColor },
        weight ? { fontWeight: fontWeight[weight] } : null,
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  );
}
