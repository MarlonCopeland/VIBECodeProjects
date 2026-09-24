// app/(auth)/reset-password.tsx
// Password reset by CODE, with the emailed link kept as a same-device shortcut.
//
// Two ways in:
//   1. Arrived from "Forgot password" with ?email= — enter the emailed code,
//      then the new password. Works when the email is read on another device,
//      which is the normal case.
//   2. Tapped the emailed link on this device — the link carries a session, so
//      the code step is skipped entirely.
//
// The root gate exempts this route: redeeming either a code or a link produces
// a real session, and without the exemption the gate would fling the user into
// the app before they could set a password.

import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeProvider';
import { toAppError } from '../../src/lib/errors';

type Phase = 'checking' | 'code' | 'password' | 'invalid' | 'done';

export default function ResetPasswordScreen() {
  const { redeemAuthLink, verifyEmailCode, updatePassword, status, signOut } = useAuth();
  const { spacing } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email ?? '').trim();

  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const settled = useRef(false);

  const consumeLink = useCallback(
    async (url: string | null) => {
      if (settled.current) return;
      try {
        if (url && (await redeemAuthLink(url))) {
          settled.current = true;
          setPhase('password');
          return;
        }
      } catch (e) {
        settled.current = true;
        setError(toAppError(e).message);
        setPhase('invalid');
        return;
      }
      // No link session. An existing one is still good enough to set a
      // password; otherwise fall back to asking for the emailed code.
      settled.current = true;
      setPhase(status === 'authenticated' ? 'password' : email ? 'code' : 'invalid');
    },
    [redeemAuthLink, status, email],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await Linking.getInitialURL();
      if (!cancelled) await consumeLink(initial);
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      settled.current = false;
      void consumeLink(url);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [consumeLink]);

  const submitCode = async () => {
    const entered = code.trim();
    if (!entered) return;
    setError('');
    setBusy(true);
    try {
      await verifyEmailCode(email, entered, 'recovery');
      setPhase('password');
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    setError('');
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setPhase('done');
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'checking') {
    return (
      <Screen center>
        <Text tone="muted">Checking your reset request…</Text>
      </Screen>
    );
  }

  if (phase === 'invalid') {
    return (
      <Screen scroll center>
        <View style={{ marginBottom: spacing.xl }}>
          <Text variant="title" weight="bold">
            Reset code expired
          </Text>
          <Text tone="muted" style={{ marginTop: spacing.xs }}>
            Reset codes and links are single-use and expire after an hour. Request a
            fresh one and you can finish on this device.
          </Text>
        </View>
        <Banner kind="error" message={error} />
        <Button title="Send a new code" onPress={() => router.replace('/(auth)/forgot-password')} />
        <View style={{ marginTop: spacing.md }}>
          <Button
            title="Back to sign in"
            variant="ghost"
            onPress={() => router.replace('/(auth)/login')}
          />
        </View>
      </Screen>
    );
  }

  if (phase === 'done') {
    return (
      <Screen scroll center>
        <View style={{ marginBottom: spacing.xl }}>
          <Text variant="title" weight="bold">
            Password updated
          </Text>
          <Text tone="muted" style={{ marginTop: spacing.xs }}>
            You are signed in with your new password.
          </Text>
        </View>
        <Button title="Continue" onPress={() => router.replace('/(app)/(tabs)')} />
        <View style={{ marginTop: spacing.md }}>
          <Button
            title="Sign out"
            variant="ghost"
            onPress={() => {
              void signOut().then(() => router.replace('/(auth)/login'));
            }}
          />
        </View>
      </Screen>
    );
  }

  if (phase === 'code') {
    return (
      <Screen scroll center>
        <View style={{ marginBottom: spacing.xl }}>
          <Text variant="title" weight="bold">
            Enter your reset code
          </Text>
          <Text tone="muted" style={{ marginTop: spacing.xs }}>
            {`We sent a code to ${email}. You can read it on any device.`}
          </Text>
        </View>

        <Banner kind="error" message={error} />

        <TextField
          label="Reset code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          autoCapitalize="none"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="123456"
          maxLength={10}
        />

        <Button title="Continue" onPress={submitCode} loading={busy} disabled={!code.trim()} />
        <View style={{ marginTop: spacing.xl }}>
          <Button
            title="Send a new code"
            variant="ghost"
            onPress={() => router.replace('/(auth)/forgot-password')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll center>
      <View style={{ marginBottom: spacing.xl }}>
        <Text variant="title" weight="bold">
          Choose a new password
        </Text>
        <Text tone="muted" style={{ marginTop: spacing.xs }}>
          Pick something you have not used before.
        </Text>
      </View>

      <Banner kind="error" message={error} />

      <TextField
        label="New password"
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <TextField
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        placeholder="Repeat it"
      />

      <Button
        title="Save new password"
        onPress={savePassword}
        loading={busy}
        disabled={!password || !confirm}
      />
      <View style={{ marginTop: spacing.md }}>
        <Button title="Cancel" variant="ghost" onPress={() => router.replace('/(auth)/login')} />
      </View>
    </Screen>
  );
}
