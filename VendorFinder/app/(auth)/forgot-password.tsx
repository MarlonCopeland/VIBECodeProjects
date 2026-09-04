// app/(auth)/forgot-password.tsx
// Sends a password-reset email via the backend auth API.

import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAsyncAction } from '../../src/lib/useAsyncAction';

export default function ForgotPasswordScreen() {
  const { sendPasswordReset } = useAuth();
  const { spacing } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { error, busy, run } = useAsyncAction();

  const submit = () =>
    run(async () => {
      await sendPasswordReset(email);
      setSent(true);
    });

  return (
    <Screen scroll center>
      <View style={{ marginBottom: spacing.xl }}>
        <Text variant="title" weight="bold">
          Reset password
        </Text>
        <Text tone="muted" style={{ marginTop: spacing.xs }}>
          Enter your email and we&apos;ll send a reset link.
        </Text>
      </View>

      <Banner kind="error" message={error} />
      {sent ? (
        <Banner kind="success" message="If that email exists, a reset link is on its way." />
      ) : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
      />

      <Button title="Send reset link" onPress={submit} loading={busy} />
      <View style={{ marginTop: spacing.md }}>
        <Button title="Back to sign in" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
