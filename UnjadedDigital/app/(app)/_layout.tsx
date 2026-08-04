// app/(app)/_layout.tsx
// Stack for the authenticated area. The tab group is the base; detail screens
// (profile edit, subscription) push on top with a themed header.

import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile/edit" options={{ title: 'Edit Profile', presentation: 'modal' }} />
      <Stack.Screen name="subscription" options={{ title: 'Subscription' }} />
    </Stack>
  );
}
