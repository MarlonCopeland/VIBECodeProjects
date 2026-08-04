// app/(app)/(tabs)/profile.tsx
// Read-only profile summary with entry points to edit and (if enabled) manage
// a subscription.

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { Avatar } from '../../../src/components/Avatar';
import { useAuth } from '../../../src/features/auth/AuthContext';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { isFeatureEnabled } from '../../../src/config/features';

export default function ProfileScreen() {
  const { user } = useAuth();
  const { spacing } = useTheme();
  const router = useRouter();
  const bio = (user?.metadata?.bio as string) || '';

  return (
    <Screen scroll>
      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <Avatar uri={user?.avatarUrl} name={user?.displayName} size={96} />
        <Text variant="heading" weight="semibold" style={{ marginTop: spacing.md }}>
          {user?.displayName}
        </Text>
        <Text tone="muted">{user?.email}</Text>
      </View>

      {bio ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
            ABOUT
          </Text>
          <Text>{bio}</Text>
        </Card>
      ) : null}

      <Button title="Edit profile" onPress={() => router.push('/(app)/profile/edit')} />

      {isFeatureEnabled('payments') ? (
        <View style={{ marginTop: spacing.md }}>
          <Button
            title="Manage subscription"
            variant="secondary"
            onPress={() => router.push('/(app)/subscription')}
          />
        </View>
      ) : null}
    </Screen>
  );
}
