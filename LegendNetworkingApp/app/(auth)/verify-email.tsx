// app/(auth)/verify-email.tsx
// Email confirmation by CODE, not link.
//
// The link-only flow stranded the common case: sign up on one device (emulator,
// a fresh TestFlight install), read email on your phone, tap the link — and it
// opens on the phone while the device you actually signed up on sits waiting
// forever. A code is device-agnostic: read it anywhere, type it here.
//
// The deep link still works when it happens to land on this device, so the
// listener stays as a fast path.

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeProvider';
import { toAppError } from '../../src/lib/errors';

export default function VerifyEmailScreen() {
  const { user, refresh, resendVerification, signOut, redeemAuthLink, verifyEmailCode } = useAuth();
  const { spacing } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();

  // Signed-up-but-not-signed-in has no user yet, so the address arrives as a
  // route param; an already-signed-in unverified user has it on the session.
  const email = (params.email ?? user?.email ?? '').trim();

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  // Fast path: the link landed on this device after all.
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

  const submit = async (value?: string) => {
    const entered = (value ?? code).trim();
    if (!entered) return;
    setError('');
    setNotice('');
    setVerifying(true);
    try {
      await verifyEmailCode(email, entered, 'signup');
      // The root gate takes it from here once a session exists.
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setVerifying(false);
    }
  };

  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).replace(/[^0-9A-Za-z]/g, '');
    if (!text) return;
    setCode(text);
    void submit(text);
  };

  const resend = async () => {
    setError('');
    setNotice('');
    setResending(true);
    try {
      await resendVerification(email);
      setNotice('Sent. Check your inbox for a new code.');
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen scroll center>
      <View style={{ marginBottom: spacing.xl }}>
        <Text variant="title" weight="bold">Confirm your email</Text>
        <Text tone="muted" style={{ marginTop: spacing.sm }}>
          {email
            ? `We sent a code to ${email}. Enter it below — you can read it on any device.`
            : 'Enter the code from your confirmation email.'}
        </Text>
      </View>

      <Banner kind="error" message={error} />
      <Banner kind="info" message={notice} />

      <TextField
        label="Confirmation code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        autoCapitalize="none"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        placeholder="12345678"
        maxLength={10}
      />

      <Button
        title="Confirm email"
        onPress={() => void submit()}
        loading={verifying}
        disabled={!code.trim()}
      />
      <View style={{ marginTop: spacing.sm }}>
        <Button title="Paste code" variant="secondary" onPress={() => void paste()} />
      </View>

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Button title="Resend code" variant="ghost" onPress={() => void resend()} loading={resending} />
        <Button title="I already confirmed — continue" variant="ghost" onPress={() => void refresh()} />
        <Button
          title={user ? 'Sign out' : 'Back to sign in'}
          variant="ghost"
          onPress={() => {
            if (user) void signOut();
            else router.replace('/(auth)/login');
          }}
        />
      </View>
    </Screen>
  );
}
