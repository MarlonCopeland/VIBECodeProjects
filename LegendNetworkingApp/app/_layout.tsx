// app/_layout.tsx
// Root layout. Mounts global providers and renders a themed navigation stack.
// The auth GATE lives here: it watches auth status and redirects between the
// (auth) and (app) route groups so screens never have to check auth manually.

import { useEffect } from 'react';
import { Slot, SplashScreen, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/AppProviders';
import { useAuth } from '../src/features/auth/AuthContext';
import { useTheme } from '../src/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { status, needsVerification } = useAuth();
  const { scheme } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    SplashScreen.hideAsync().catch(() => {});

    const group = segments[0]; // '(auth)' | '(app)' | undefined
    const inAuthGroup = group === '(auth)';
    const inAppGroup = group === '(app)';

    if (status === 'unauthenticated') {
      // Push anyone signed out (including the index splash) to login.
      if (!inAuthGroup) router.replace('/(auth)/login');
    } else if (status === 'authenticated') {
      if (needsVerification) {
        // Pin unverified users to the verification screen.
        if (segments.join('/') !== '(auth)/verify-email') {
          router.replace('/(auth)/verify-email');
        }
      } else if (!inAppGroup) {
        // Verified: land in the app from the index splash or the auth flow.
        router.replace('/(app)/(tabs)');
      }
    }
  }, [status, needsVerification, segments, router]);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
