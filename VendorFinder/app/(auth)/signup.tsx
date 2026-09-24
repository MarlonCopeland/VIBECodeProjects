// app/(auth)/signup.tsx
// Account creation with a User/Vendor toggle, live password-strength feedback,
// and validation. Vendor sign-ups also collect a vendor name + type and create
// the paired vendor record.

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { PasswordStrengthMeter } from '../../src/features/auth/components/PasswordStrengthMeter';
import { SocialAuthButtons } from '../../src/features/auth/components/SocialAuthButtons';
import { VENDOR_TYPES } from '../../src/features/vendors';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAsyncAction } from '../../src/lib/useAsyncAction';
import type { UserRole, VendorType } from '../../src/backend/types';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('user');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorType, setVendorType] = useState<VendorType>('Food');
  const { error, notice, busy, run, setError, setNotice } = useAsyncAction();

  const submit = () =>
    run(async () => {
      const { needsEmailConfirmation } = await signUp({
        displayName,
        email,
        password,
        role,
        vendorInfo: role === 'vendor' ? { name: vendorName, type: vendorType } : undefined,
      });
      if (needsEmailConfirmation) {
        setNotice('Almost there — enter the code we emailed you.');
        // Carry the address over: sign-up may not have produced a session, so
        // the verify screen has no user to read it from.
        router.push({ pathname: '/(auth)/verify-email', params: { email: email.trim() } });
      }
    });

  return (
    <Screen scroll center>
      <View style={{ marginBottom: spacing.xl }}>
        <Text variant="display" weight="bold">
          Create account
        </Text>
        <Text tone="muted" style={{ marginTop: spacing.xs }}>
          Join as a customer or a vendor.
        </Text>
      </View>

      <Banner kind="error" message={error} />
      <Banner kind="success" message={notice} />

      {/* Role toggle */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        {(['user', 'vendor'] as UserRole[]).map((r) => {
          const active = role === r;
          return (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              style={{
                flex: 1,
                paddingVertical: spacing.md,
                alignItems: 'center',
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primary : 'transparent',
              }}
            >
              <Text tone={active ? 'inverse' : 'default'} weight="semibold">
                {r === 'user' ? 'Customer' : 'Vendor'}
              </Text>
            </Pressable>
          );
        })}
      </View>

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

      {role === 'vendor' ? (
        <View style={{ marginTop: spacing.sm }}>
          <TextField
            label="Vendor name"
            value={vendorName}
            onChangeText={setVendorName}
            placeholder="e.g. The Gourmet Bistro Truck"
          />
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
            Vendor type
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
            {VENDOR_TYPES.map((t) => {
              const active = vendorType === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setVendorType(t)}
                  style={{
                    paddingVertical: spacing.xs,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary : 'transparent',
                  }}
                >
                  <Text variant="label" tone={active ? 'inverse' : 'default'}>
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Button title="Create account" onPress={submit} loading={busy} />

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
