// app/(auth)/verify-email.tsx
// Holding screen for authenticated-but-unverified users. Supports two paths:
//   - Supabase: click the emailed link, then "I've verified — continue" (polls).
//   - Local demo: a 6-digit code is logged to the console ([VERIFY] ...); enter
//     it here to confirm.
// No app feature is reachable until the email is verified (see the root gate).

import { useState } from 'react';
import { View } from 'react-native';
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
  const { user, refresh, confirmVerification, resendVerification, signOut } = useAuth();
  const { spacing } = useTheme();

  const [code, setCode] = useState('');
  // Three buttons spin independently but share one error/notice banner.
  const { error, notice, isBusy, run, setNotice } = useAsyncAction();

  const isLocal = BACKEND === 'local';

  // On success the root gate routes onward automatically.
  const confirm = () => run(() => confirmVerification(code.trim()), 'confirm');

  const check = () =>
    run(async () => {
      await refresh();
      setNotice('Not verified yet. Click the link in your email, then try again.');
    }, 'check');

  const resend = () =>
    run(async () => {
      await resendVerification();
      setNotice(isLocal ? 'New code generated — check the console log.' : 'Verification email sent.');
    }, 'resend');

  return (
    <Screen scroll center>
      <View style={{ marginBottom: spacing.xl }}>
        <Text variant="title" weight="bold">
          Verify your email
        </Text>
        <Text tone="muted" style={{ marginTop: spacing.sm }}>
          {isLocal
            ? `We sent a 6-digit code to ${user?.email ?? 'your email'} (logged to the console in demo mode). Enter it below.`
            : `We sent a confirmation link to ${user?.email ?? 'your email'}. Confirm it to continue.`}
        </Text>
      </View>

      <Banner kind="error" message={error} />
      <Banner kind="info" message={notice} />

      {isLocal ? (
        <>
          <TextField
            label="Verification code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            placeholder="123456"
            maxLength={6}
          />
          <Button title="Verify" onPress={confirm} loading={isBusy('confirm')} />
        </>
      ) : (
        <Button title="I've verified — continue" onPress={check} loading={isBusy('check')} />
      )}

      <View style={{ marginTop: spacing.md }}>
        <Button title="Resend" variant="secondary" onPress={resend} loading={isBusy('resend')} />
      </View>
      <View style={{ marginTop: spacing.md }}>
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}
