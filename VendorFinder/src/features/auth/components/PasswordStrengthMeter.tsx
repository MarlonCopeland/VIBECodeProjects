// src/features/auth/components/PasswordStrengthMeter.tsx
// Visual 4-segment strength bar driven by scorePasswordStrength().

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../../theme/ThemeProvider';
import { Text } from '../../../components/Text';
import { scorePasswordStrength } from '../../../lib/validation';

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { colors, spacing, radius } = useTheme();
  if (!password) return null;

  const { score, label } = scorePasswordStrength(password);
  const color =
    score <= 1 ? colors.danger : score === 2 ? colors.warning : score === 3 ? colors.primary : colors.success;

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: radius.sm,
              backgroundColor: i < score ? color : colors.border,
            }}
          />
        ))}
      </View>
      <Text variant="caption" style={{ color, marginTop: spacing.xs }}>
        {`Strength: ${label}`}
      </Text>
    </View>
  );
}
