// app/(auth)/verify-email.tsx
// Holding screen for authenticated-but-unverified users. Polls the session on
// demand (after the user clicks the emailed link) and can resend the email.

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeProvider';
import { toAppError } from '../../src/lib/errors';

export default function VerifyEmailScreen() {
  const { user, refresh, resendVerification, signOut, redeemAuthLink } = useAuth();
  const { spacing } = useTheme();

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  // Confirmation links land back here carrying a session. Redeem it so the
  // user is verified on the spot instead of having to tap "I've verified".
  useEffect(() => {
    let cancelled = false;
    const consume = async (url: string | null) => {
      if (!url || cancelled) return;
      try {
        await redeemAuthLink(url);
      } catch (e) {
        if (!cancelled) setError(toAppError(e).message);
      }
    };
    void Linking.getInitialURL().then(consume);
    const sub = Linking.addEventListener('url', ({ url }) => void consume(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [redeemAuthLink]);

  const check = async () => {
    setError('');
    setNotice('');
    setChecking(true);
    try {
      await refresh();
      // If verified, the root gate routes onward automatically.
      setNotice('Not verified yet. Click the link in your email, then try again.');
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    setError('');
    setNotice('');
    setResending(true);
    try {
      await resendVerification();
      setNotice('Verification email sent.');
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen center>
      <View style={{ marginBottom: spacing.xl }}>
        <Text variant="title" weight="bold">
          Verify your email
        </Text>
        <Text tone="muted" style={{ marginTop: spacing.sm }}>
          {`We sent a confirmation link to ${user?.email ?? 'your email'}. Confirm it to continue.`}
        </Text>
      </View>

      <Banner kind="error" message={error} />
      <Banner kind="info" message={notice} />

      <Button title="I've verified — continue" onPress={check} loading={checking} />
      <View style={{ marginTop: spacing.md }}>
        <Button title="Resend email" variant="secondary" onPress={resend} loading={resending} />
      </View>
      <View style={{ marginTop: spacing.md }}>
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}
