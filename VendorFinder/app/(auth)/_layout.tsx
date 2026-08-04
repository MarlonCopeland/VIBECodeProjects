// app/(auth)/_layout.tsx
// Stack for the unauthenticated flow. Headerless; screens provide their own.

import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    />
  );
}
