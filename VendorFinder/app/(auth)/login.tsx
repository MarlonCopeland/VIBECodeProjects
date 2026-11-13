// app/(auth)/login.tsx
// Email/password sign-in with OAuth options and links to sign-up + reset.

import { useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { SocialAuthButtons } from '../../src/features/auth/components/SocialAuthButtons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAsyncAction } from '../../src/lib/useAsyncAction';
import { BACKEND } from '../../src/config/env';
import {
  AuroraBackground,
  VendorMarqueeBackground,
} from '../../src/features/auth/components/LoginBackgrounds';

// Login background under evaluation. Preview others with `/login?bg=marquee`
// or `/login?bg=classic`; drop the param plumbing once one is chosen.
type LoginBg = 'aurora' | 'marquee' | 'classic';
const DEFAULT_BG: LoginBg = 'aurora';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ bg?: string }>();
  const bg: LoginBg =
    params.bg === 'aurora' || params.bg === 'marquee' || params.bg === 'classic'
      ? params.bg
      : DEFAULT_BG;
  const styled = bg !== 'classic';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, busy, run, setError } = useAsyncAction();

  // Gate in the root layout handles navigation on success.
  const submit = () => run(() => signIn({ email, password }));

  const cardStyle: ViewStyle | null = styled
    ? {
        width: '100%',
        maxWidth: 440,
        alignSelf: 'center',
        padding: spacing.xl,
        borderRadius: radius.xl,
        // 8-digit hex: theme surface at ~75% so the background glows through.
        backgroundColor: `${colors.surface}BF`,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        ...(Platform.OS === 'web'
          ? ({ backdropFilter: 'blur(18px)' } as unknown as ViewStyle)
          : null),
      }
    : null;

  const form = (
    <View style={cardStyle}>
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

      <Button title="Sign in" onPress={submit} loading={busy} />

      <SocialAuthButtons onError={setError} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
        <Text tone="muted">Don&apos;t have an account? </Text>
        <Link href="/(auth)/signup" onPress={() => router.setParams({})}>
          <Text tone="primary" weight="semibold">
            Sign up
          </Text>
        </Link>
      </View>
    </View>
  );

  if (!styled) {
    return (
      <Screen scroll center>
        {form}
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {bg === 'aurora' ? <AuroraBackground /> : <VendorMarqueeBackground />}
      <View style={StyleSheet.absoluteFill}>
        <Screen scroll center transparent>
          {form}
        </Screen>
      </View>
    </View>
  );
}
