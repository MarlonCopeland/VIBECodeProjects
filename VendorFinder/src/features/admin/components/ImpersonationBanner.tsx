// src/features/admin/components/ImpersonationBanner.tsx
// Persistent bar shown while an admin is impersonating another account, with a
// one-tap Stop action to return to the admin identity.

import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';
import { useTheme } from '../../../theme/ThemeProvider';
import { useAuth } from '../../auth/AuthContext';

export function ImpersonationBanner() {
  const { isImpersonating, user, stopImpersonating } = useAuth();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  if (!isImpersonating) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.text,
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Text tone="inverse" variant="label" style={{ flex: 1 }}>
        Viewing as <Text tone="inverse" weight="bold">{user?.displayName}</Text> ({user?.role})
      </Text>
      <Pressable accessibilityRole="button" onPress={stopImpersonating} hitSlop={8}>
        <Text weight="bold" style={{ color: colors.warning }}>
          Stop
        </Text>
      </Pressable>
    </View>
  );
}
