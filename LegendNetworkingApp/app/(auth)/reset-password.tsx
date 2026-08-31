// app/(auth)/reset-password.tsx
// The other half of "Forgot password". `sendPasswordReset` has always pointed
// its redirect at /reset-password, but the route never existed — so the emailed
// link opened the app onto nothing. This screen redeems the recovery link,
// which signs the user in just long enough to set a new password.
//
// The root gate deliberately exempts this route: a recovery link produces a
// real authenticated session, and without the exemption the gate would bounce
// straight to the tabs before the new password could be typed.

import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeProvider';
import { toAppError } from '../../src/lib/errors';

type Phase = 'redeeming' | 'ready' | 'invalid' | 'done';

export default function ResetPasswordScreen() {
  const { redeemAuthLink, updatePassword, status, signOut } = useAuth();
  const { spacing } = useTheme();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('redeeming');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const redeemed = useRef(false);

  const consume = useCallback(
    async (url: string | null) => {
      if (redeemed.current) return;
      redeemed.current = true;
      try {
        if (url && (await redeemAuthLink(url))) {
          setPhase('ready');
          return;
        }
        // No credentials in the link. An already-live session (the user tapped
        // the link, got signed in, and came back) is still good enough to set
        // a password; anything else means the link was stale.
        setPhase(status === 'authenticated' ? 'ready' : 'invalid');
      } catch (e) {
        setError(toAppError(e).message);
        setPhase('invalid');
      }
    },
    [redeemAuthLink, status],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await Linking.getInitialURL();
      if (!cancelled) await consume(initial);
    })();
    // Cold start hands the URL to getInitialURL; a warm app gets an event.
    const sub = Linking.addEventListener('url', ({ url }) => {
      redeemed.current = false;
      void consume(url);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [consume]);

  const submit = async () => {
    setError('');
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }
    setSaving(true);
    try {
      await updatePassword(password);
      setPhase('done');
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setSaving(false);
    }
  };

  if (phase === 'redeeming') {
    return (
      <Screen center>
        <Text tone="muted">Checking your reset link…</Text>
      </Screen>
    );
  }

  if (phase === 'invalid') {
    return (
      <Screen scroll center>
        <View style={{ marginBottom: spacing.xl }}>
          <Text variant="title" weight="bold">Link expired</Text>
          <Text tone="muted" style={{ marginTop: spacing.xs }}>
            Password reset links can only be used once, and they expire after a short
            while. Request a fresh one and open it on this device.
          </Text>
        </View>
        <Banner kind="error" message={error} />
        <Button title="Send a new link" onPress={() => router.replace('/(auth)/forgot-password')} />
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
          <Text variant="title" weight="bold">Password updated</Text>
          <Text tone="muted" style={{ marginTop: spacing.xs }}>
            You&apos;re signed in with your new password.
          </Text>
        </View>
        <Button title="Continue to Legend" onPress={() => router.replace('/(app)/(tabs)')} />
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

  return (
    <Screen scroll center>
      <View style={{ marginBottom: spacing.xl }}>
        <Text variant="title" weight="bold">Choose a new password</Text>
        <Text tone="muted" style={{ marginTop: spacing.xs }}>
          Pick something you haven&apos;t used before.
        </Text>
      </View>

      <Banner kind="error" message={error} />

      <TextField
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <TextField
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        placeholder="Repeat it"
      />

      <Button
        title="Save new password"
        onPress={submit}
        loading={saving}
        disabled={!password || !confirm}
      />
      <View style={{ marginTop: spacing.md }}>
        <Button
          title="Cancel"
          variant="ghost"
          onPress={() => router.replace('/(auth)/login')}
        />
      </View>
    </Screen>
  );
}
