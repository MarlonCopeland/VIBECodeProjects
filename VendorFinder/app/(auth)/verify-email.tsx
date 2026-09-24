// app/(auth)/verify-email.tsx
// Email confirmation by CODE, not link.
//
// The link-only flow stranded the common case: sign up on one device (an
// emulator, a fresh TestFlight install), read the email on your phone, tap the
// link — and it opens on the phone while the device you actually signed up on
// waits forever. A code is device-agnostic: read it anywhere, type it here.
//
// The deep link still works when it happens to land on this device, so the
// listener stays as a fast path. On the offline demo backend the same code is
// logged to the console ([VERIFY] ...) instead of being emailed.
//
// No app feature is reachable until the email is verified (see the root gate).

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { BACKEND } from '../../src/config/env';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAsyncAction } from '../../src/lib/useAsyncAction';

export default function VerifyEmailScreen() {
  const { user, refresh, resendVerification, signOut, redeemAuthLink, verifyEmailCode } = useAuth();
  const { spacing } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();

  // Signed-up-but-not-signed-in has no user yet, so the address arrives as a
  // route param; an already-signed-in unverified user has it on the session.
  const email = (params.email ?? user?.email ?? '').trim();

  const [code, setCode] = useState('');
  // The buttons spin independently but share one error/notice banner.
  const { error, notice, isBusy, run, setError, setNotice } = useAsyncAction();

  const isLocal = BACKEND === 'local';

  // Fast path: the link landed on this device after all.
  useEffect(() => {
    let cancelled = false;
    const consume = async (url: string | null) => {
      if (!url || cancelled) return;
      try {
        await redeemAuthLink(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void Linking.getInitialURL().then(consume);
    const sub = Linking.addEventListener('url', ({ url }) => void consume(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [redeemAuthLink, setError]);

  // On success the root gate routes onward automatically.
  const confirm = () => run(() => verifyEmailCode(email, code.trim(), 'signup'), 'confirm');

  const check = () =>
    run(async () => {
      await refresh();
      setNotice('Not confirmed yet. Enter the code from your email, or try again.');
    }, 'check');

  const resend = () =>
    run(async () => {
      await resendVerification(email);
      setNotice(isLocal ? 'New code generated — check the console log.' : 'Sent. Check your inbox for a new code.');
    }, 'resend');

  return (
    <Screen scroll center>
      <View style={{ marginBottom: spacing.xl }}>
        <Text variant="title" weight="bold">
          Confirm your email
        </Text>
        <Text tone="muted" style={{ marginTop: spacing.sm }}>
          {isLocal
            ? `We sent a code to ${email || 'your email'} (logged to the console in demo mode). Enter it below.`
            : email
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
        placeholder="123456"
        maxLength={10}
      />

      <Button
        title="Confirm email"
        onPress={confirm}
        loading={isBusy('confirm')}
        disabled={!code.trim()}
      />

      <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
        <Button title="Resend code" variant="secondary" onPress={resend} loading={isBusy('resend')} />
        <Button
          title="I already confirmed — continue"
          variant="ghost"
          onPress={check}
          loading={isBusy('check')}
        />
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
