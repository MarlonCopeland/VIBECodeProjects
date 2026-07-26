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
      <Stack.Screen name="contact/[id]" options={{ title: 'Contact' }} />
      <Stack.Screen name="contact/edit" options={{ title: 'Contact', presentation: 'modal' }} />
      <Stack.Screen name="contacts-import" options={{ title: 'Import Contacts' }} />
      <Stack.Screen name="circle/[id]" options={{ title: 'Circle' }} />
      <Stack.Screen name="circle/edit" options={{ title: 'Circle', presentation: 'modal' }} />
      <Stack.Screen name="outreach/text" options={{ title: 'Text Blast' }} />
      <Stack.Screen name="outreach/email" options={{ title: 'Email Blast' }} />
      <Stack.Screen name="outreach/calls" options={{ title: 'Call List' }} />
      <Stack.Screen name="profile/edit" options={{ title: 'Edit Profile', presentation: 'modal' }} />
      <Stack.Screen name="subscription" options={{ title: 'Subscription' }} />
    </Stack>
  );
}
