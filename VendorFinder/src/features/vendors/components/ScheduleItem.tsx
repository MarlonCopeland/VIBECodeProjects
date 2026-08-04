// src/features/vendors/components/ScheduleItem.tsx
// One row of a vendor's weekly schedule.

import React from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/Text';
import { useTheme } from '../../../theme/ThemeProvider';
import type { ScheduleSlot } from '../../../backend/types';

export function ScheduleItem({ entry }: { entry: ScheduleSlot }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text weight="bold" style={{ width: 52 }}>
        {entry.day}
      </Text>
      <View style={{ flex: 1 }}>
        <Text variant="label">
          {entry.start} – {entry.end}
        </Text>
        {entry.address ? (
          <Text tone="muted" variant="caption" style={{ marginTop: 2 }}>
            {entry.address}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
