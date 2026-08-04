// src/components/Screen.tsx
// Themed screen container: applies safe-area insets, background color, and an
// optional scroll + keyboard-avoiding behavior. Every screen wraps in this so
// padding/background stays consistent.

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  center?: boolean;
  edges?: readonly Edge[];
  style?: ViewStyle;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  center = false,
  edges = ['top', 'bottom'],
  style,
}: ScreenProps) {
  const { colors, spacing } = useTheme();

  const inner: ViewStyle = {
    flexGrow: 1,
    padding: padded ? spacing.lg : 0,
    justifyContent: center ? 'center' : 'flex-start',
  };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[inner, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[inner, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={edges}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
