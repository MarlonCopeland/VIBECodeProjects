// src/components/Banner.tsx
// Inline status banner for success/error/info/warning messaging in forms.

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

type Kind = 'info' | 'success' | 'warning' | 'error';

export function Banner({ kind = 'info', message }: { kind?: Kind; message: string }) {
  const { colors, radius, spacing } = useTheme();
  if (!message) return null;

  const accent = {
    info: colors.primary,
    success: colors.success,
    warning: colors.warning,
    error: colors.danger,
  }[kind];

  return (
    <View
      style={{
        backgroundColor: colors.surfaceAlt,
        borderLeftWidth: 3,
        borderLeftColor: accent,
        borderRadius: radius.sm,
        padding: spacing.md,
        marginBottom: spacing.md,
      }}
    >
      <Text variant="label" style={{ color: accent }}>
        {message}
      </Text>
    </View>
  );
}
