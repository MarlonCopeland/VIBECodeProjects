// src/features/auth/components/SocialAuthButtons.tsx
// Renders OAuth sign-in buttons for whichever providers are enabled in config.
// Hidden entirely when no providers are configured.

import React, { useState } from 'react';
import { View } from 'react-native';
import { APPLE_AUTH_ENABLED, GOOGLE_AUTH_ENABLED } from '../../../config/env';
import { useTheme } from '../../../theme/ThemeProvider';
import { Button } from '../../../components/Button';
import { Text } from '../../../components/Text';
import { toAppError } from '../../../lib/errors';
import { useAuth } from '../AuthContext';
import type { OAuthProvider } from '../../../backend/types';

export function SocialAuthButtons({ onError }: { onError?: (msg: string) => void }) {
  const { colors, spacing } = useTheme();
  const { signInWithProvider } = useAuth();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  const providers: OAuthProvider[] = [
    ...(GOOGLE_AUTH_ENABLED ? (['google'] as const) : []),
    ...(APPLE_AUTH_ENABLED ? (['apple'] as const) : []),
  ];
  if (providers.length === 0) return null;

  const labels: Record<OAuthProvider, string> = {
    google: 'Continue with Google',
    apple: 'Continue with Apple',
    facebook: 'Continue with Facebook',
  };

  const handle = async (provider: OAuthProvider) => {
    setBusy(provider);
    try {
      await signInWithProvider(provider);
    } catch (e) {
      onError?.(toAppError(e).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ marginTop: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text variant="caption" tone="muted" style={{ marginHorizontal: spacing.md }}>
          OR
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>
      {providers.map((p) => (
        <View key={p} style={{ marginBottom: spacing.sm }}>
          <Button
            title={labels[p]}
            variant="secondary"
            loading={busy === p}
            onPress={() => handle(p)}
          />
        </View>
      ))}
    </View>
  );
}
