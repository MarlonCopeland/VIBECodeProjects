// app/(app)/_layout.tsx
// Stack for the authenticated area. The tab group is the base; detail screens
// (vendor detail/edit, followers, subscription, profile edit) push on top with
// a themed header. A persistent impersonation banner sits above the stack while
// an admin is viewing as another account.

import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { ImpersonationBanner } from '../../src/features/admin/components/ImpersonationBanner';

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ImpersonationBanner />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="vendor/[id]" options={{ title: 'Vendor' }} />
        <Stack.Screen name="vendor/edit" options={{ title: 'Edit Vendor Profile' }} />
        <Stack.Screen name="followers" options={{ title: 'Followers' }} />
        <Stack.Screen name="subscription" options={{ title: 'Subscription' }} />
        <Stack.Screen name="profile/edit" options={{ title: 'Edit Profile', presentation: 'modal' }} />
      </Stack>
    </View>
  );
}
