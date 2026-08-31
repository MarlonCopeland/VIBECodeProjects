// app/_layout.tsx
// Root layout. Mounts global providers and renders a themed navigation stack.
// The auth GATE lives here: it watches auth status and redirects between the
// (auth) and (app) route groups so screens never have to check auth manually.

import { useEffect, useState } from 'react';
import { Slot, SplashScreen, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/AppProviders';
import { AnimatedSplash } from '../src/components/AnimatedSplash';
import { recordAppOpenOnce } from '../src/features/metrics/usage';
import { useAuth } from '../src/features/auth/AuthContext';
import { useTheme } from '../src/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { status, needsVerification } = useAuth();
  const { scheme } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  // The native splash is swapped for an identical animated overlay the first
  // time auth resolves; the overlay then fades/zooms out to reveal the app.
  // AnimatedSplash guards internally so hideAsync() runs exactly once — calling
  // it again after the splash is gone makes iOS throw "No native splash screen
  // registered for given view controller".
  const [splashDone, setSplashDone] = useState(false);

  // Usage metrics: one app-open ping per launch, once signed in. Best-effort;
  // a no-op on the local/demo backend.
  useEffect(() => {
    if (status === 'authenticated') void recordAppOpenOnce();
  }, [status]);

  useEffect(() => {
    if (status === 'loading') return;

    const group = segments[0]; // '(auth)' | '(app)' | undefined
    const inAuthGroup = group === '(auth)';
    const inAppGroup = group === '(app)';
    const route = segments.join('/');
    // A recovery link signs the user in for real, so without this exemption the
    // gate would fling them into the tabs the instant the link is redeemed —
    // before they ever get to type the new password.
    const settingNewPassword = route === '(auth)/reset-password';

    if (status === 'unauthenticated') {
      // Push anyone signed out (including the index splash) to login.
      if (!inAuthGroup) router.replace('/(auth)/login');
    } else if (status === 'authenticated') {
      if (settingNewPassword) {
        // Let the reset screen finish; it routes onward itself.
      } else if (needsVerification) {
        // Pin unverified users to the verification screen.
        if (route !== '(auth)/verify-email') {
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
      {!splashDone ? (
        <AnimatedSplash ready={status !== 'loading'} onDone={() => setSplashDone(true)} />
      ) : null}
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
