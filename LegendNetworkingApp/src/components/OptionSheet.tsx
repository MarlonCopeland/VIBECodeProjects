// src/components/OptionSheet.tsx
// Themed bottom-sheet action menu. Used wherever the app needs "pick one of
// N actions" (the contacts + menu, choosing among a contact's phone numbers,
// etc.). A Modal-based sheet rather than Alert because Android's Alert caps
// at three buttons and neither platform themes Alert to match the app.

import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeProvider';

export interface OptionSheetOption {
  key: string;
  label: string;
  /** Secondary line under the label (e.g. the actual phone number). */
  detail?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

interface OptionSheetProps {
  visible: boolean;
  title?: string;
  options: OptionSheetOption[];
  onClose: () => void;
}

export function OptionSheet({ visible, title, options, onClose }: OptionSheetProps) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close menu"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}
      >
        {/* Stop backdrop-press from closing when tapping the sheet itself. */}
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              paddingTop: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              gap: 2,
            }}
          >
            {title ? (
              <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
                {title.toUpperCase()}
              </Text>
            ) : null}
            <ScrollView style={{ maxHeight: 420 }} bounces={false}>
            {options.map((opt) => (
              <Pressable
                key={opt.key}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                onPress={() => {
                  onClose();
                  opt.onPress();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                })}
              >
                {opt.icon ? (
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={opt.destructive ? colors.danger : colors.primary}
                  />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text weight="semibold" tone={opt.destructive ? 'danger' : 'default'}>
                    {opt.label}
                  </Text>
                  {opt.detail ? (
                    <Text variant="caption" tone="muted">{opt.detail}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: spacing.md,
                marginTop: spacing.xs,
                borderRadius: radius.md,
                backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              })}
            >
              <Text weight="semibold" tone="muted">Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
