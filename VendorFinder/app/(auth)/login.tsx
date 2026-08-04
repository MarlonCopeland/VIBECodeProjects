// app/(auth)/login.tsx
// Email/password sign-in with OAuth options and links to sign-up + reset.

import { useState } from 'react';
import { View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { SocialAuthButtons } from '../../src/features/auth/components/SocialAuthButtons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { toAppError } from '../../src/lib/errors';
import { BACKEND } from '../../src/config/env';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { spacing } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await signIn({ email, password });
      // Gate in the root layout handles navigation on success.
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll center>
      <View style={{ marginBottom: spacing.xl }}>
        <Text variant="display" weight="bold">
          Vendor Finder
        </Text>
        <Text tone="muted" style={{ marginTop: spacing.xs }}>
          Sign in to discover pop-up vendors near you.
        </Text>
      </View>

      <Banner kind="error" message={error} />

      <TextField
        label="Email or username"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@example.com"
        // The seeded demo admin only exists in the local backend.
        helper={
          BACKEND === 'local'
            ? 'Demo admin — username: admin, password: admin123'
            : undefined
        }
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="password"
        textContentType="password"
        placeholder="Your password"
      />

      <View style={{ alignItems: 'flex-end', marginBottom: spacing.md }}>
        <Link href="/(auth)/forgot-password">
          <Text variant="label" tone="primary">
            Forgot password?
          </Text>
        </Link>
      </View>

      <Button title="Sign in" onPress={submit} loading={loading} />

      <SocialAuthButtons onError={setError} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
        <Text tone="muted">Don&apos;t have an account? </Text>
        <Link href="/(auth)/signup" onPress={() => router.setParams({})}>
          <Text tone="primary" weight="semibold">
            Sign up
          </Text>
        </Link>
      </View>
    </Screen>
  );
}
