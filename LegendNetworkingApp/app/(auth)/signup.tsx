// app/(auth)/signup.tsx
// Account creation with live password-strength feedback and validation.

import { useState } from 'react';
import { View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { PasswordStrengthMeter } from '../../src/features/auth/components/PasswordStrengthMeter';
import { SocialAuthButtons } from '../../src/features/auth/components/SocialAuthButtons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { toAppError } from '../../src/lib/errors';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const router = useRouter();
  const { spacing } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUp({ displayName, email, password });
      if (needsEmailConfirmation) {
        // Hand off to the code screen rather than dead-ending on a banner: the
        // emailed code can be read on any device, so the user finishes here.
        router.push({ pathname: '/(auth)/verify-email', params: { email: email.trim() } });
      }
      // Gate handles navigation once a session exists.
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
          Create account
        </Text>
        <Text tone="muted" style={{ marginTop: spacing.xs }}>
          Get started in seconds.
        </Text>
      </View>

      <Banner kind="error" message={error} />
      <Banner kind="success" message={notice} />

      <TextField
        label="Name"
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        autoComplete="name"
        placeholder="Jane Doe"
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="new-password"
        placeholder="Create a strong password"
      />
      <PasswordStrengthMeter password={password} />

      <Button title="Create account" onPress={submit} loading={loading} />

      <SocialAuthButtons onError={setError} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
        <Text tone="muted">Already have an account? </Text>
        <Link href="/(auth)/login">
          <Text tone="primary" weight="semibold">
            Sign in
          </Text>
        </Link>
      </View>
    </Screen>
  );
}
