// app/(app)/(tabs)/settings.tsx
// App settings: theme control, push-notification toggle (if enabled), account
// actions (sign out, delete account), and an "about" section listing modules.

import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { useAuth } from '../../../src/features/auth/AuthContext';
import { useTheme, type ColorSchemePreference } from '../../../src/theme/ThemeProvider';
import { isFeatureEnabled } from '../../../src/config/features';
import { profileService } from '../../../src/features/profile';
import { notificationService } from '../../../src/features/notifications';
import { toAppError } from '../../../src/lib/errors';

const THEME_OPTIONS: ColorSchemePreference[] = ['system', 'light', 'dark'];

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { colors, spacing, radius, preference, setPreference } = useTheme();
  const [busy, setBusy] = useState(false);

  const confirmDelete = () => {
    // Web has no native Alert with buttons; guard accordingly.
    if (Platform.OS === 'web') {
      void doDelete();
      return;
    }
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
      ],
    );
  };

  const doDelete = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await profileService.deleteAccount(user.id);
    } catch (e) {
      Alert.alert('Error', toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const enableNotifications = async () => {
    if (!user) return;
    try {
      const token = await notificationService.registerForPushNotifications(user.id);
      Alert.alert(
        token ? 'Notifications enabled' : 'Unavailable',
        token ? 'This device will receive push notifications.' : 'Push is not available here.',
      );
    } catch (e) {
      Alert.alert('Error', toAppError(e).message);
    }
  };

  return (
    <Screen scroll>
      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        APPEARANCE
      </Text>
      <Card style={{ marginBottom: spacing.xl }}>
        <Text weight="semibold" style={{ marginBottom: spacing.md }}>
          Theme
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {THEME_OPTIONS.map((opt) => {
            const active = preference === opt;
            return (
              <View key={opt} style={{ flex: 1 }}>
                <Button
                  title={opt.charAt(0).toUpperCase() + opt.slice(1)}
                  variant={active ? 'primary' : 'secondary'}
                  onPress={() => setPreference(opt)}
                />
              </View>
            );
          })}
        </View>
      </Card>

      {isFeatureEnabled('notifications') ? (
        <>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
            NOTIFICATIONS
          </Text>
          <View style={{ marginBottom: spacing.xl }}>
            <Button title="Enable push notifications" variant="secondary" onPress={enableNotifications} />
          </View>
        </>
      ) : null}

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        ACCOUNT
      </Text>
      <View style={{ gap: spacing.md, marginBottom: spacing.xl }}>
        <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
        <Button title="Delete account" variant="danger" onPress={confirmDelete} loading={busy} />
      </View>

      <View
        style={{
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceAlt,
        }}
      >
        <Text variant="caption" tone="muted">
          Vendor Finder · signed in as {user?.email}
        </Text>
      </View>
    </Screen>
  );
}
