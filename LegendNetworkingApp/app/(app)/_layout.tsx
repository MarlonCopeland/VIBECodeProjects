// app/(app)/_layout.tsx
// Stack for the authenticated area. The tab group is the base; detail screens
// (profile edit, subscription) push on top with a themed header. Also opens
// the first-run tutorial exactly once, after persisted settings have loaded.

import { useEffect, useRef } from 'react';
import { Stack, useRouter, type Href } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAppSettings } from '../../src/features/settings/AppSettingsContext';

export default function AppLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const { ready, hasSeenTutorial } = useAppSettings();
  const tutorialShown = useRef(false);

  useEffect(() => {
    if (!ready || hasSeenTutorial || tutorialShown.current) return;
    tutorialShown.current = true;
    // Cast: typed-routes regenerate on the next `expo start`, so the literal
    // isn't in the stale union yet.
    router.push('/(app)/tutorial' as Href);
  }, [ready, hasSeenTutorial, router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        // Chevron-only back button: without this iOS labels it with the
        // previous route's name, which for the tab group is the literal
        // string "(tabs)".
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Legend' }} />
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
      <Stack.Screen name="tutorial" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
