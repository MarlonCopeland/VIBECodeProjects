// app/(app)/(tabs)/settings.tsx
// App settings: theme control, push-notification toggle (if enabled), account
// actions (sign out, delete account), and an "about" section listing modules.

import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Switch, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
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
import { useContacts } from '../../../src/features/contacts/ContactsContext';
import { contactsToCsv, interactionsToCsv, shareCsv } from '../../../src/features/contacts/importExport';
import { notify } from '../../../src/lib/notify';
import { useAppSettings } from '../../../src/features/settings/AppSettingsContext';

const THEME_OPTIONS: ColorSchemePreference[] = ['system', 'light', 'dark'];
const PRIVACY_URL = 'https://unjaded.net/legend/privacy_policy.html';
const ABOUT_URL = 'https://unjaded.net/legend/about';
const SUPPORT_EMAIL = 'marlon.unjaded@gmail.com';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { colors, spacing, radius, preference, setPreference } = useTheme();
  const { contacts, interactions } = useContacts();
  const {
    meContactId,
    excludeMeFromBulk,
    setExcludeMeFromBulk,
    contactsDefaultView,
    setContactsDefaultView,
  } = useAppSettings();
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await shareCsv('contacts.csv', contactsToCsv(contacts));
      await shareCsv('interactions.csv', interactionsToCsv(contacts, interactions));
      notify('Export complete', 'contacts.csv and interactions.csv were shared.');
    } catch (e) {
      notify('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

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

  const navRow = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    subtitle: string,
    to: string,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push(to as Href)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.surfaceAlt : colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      })}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text weight="semibold">{title}</Text>
        <Text variant="caption" tone="muted">{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );

  const emailSupport = async (kind: 'bug' | 'suggestion') => {
    const version = Constants.expoConfig?.version ?? 'unknown';
    const subject = kind === 'bug' ? `Legend bug report (v${version})` : `Legend suggestion (v${version})`;
    const body =
      kind === 'bug'
        ? `What happened?\n\n\nWhat did you expect?\n\n\n—\nApp version: ${version}\nPlatform: ${Platform.OS} ${Platform.Version ?? ''}`
        : `Your idea:\n\n\n—\nApp version: ${version}\nPlatform: ${Platform.OS} ${Platform.Version ?? ''}`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      notify('No mail app found', `Email us directly at ${SUPPORT_EMAIL}.`);
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
        CONTACTS
      </Text>
      <Card style={{ marginBottom: spacing.xl }}>
        <Text weight="semibold" style={{ marginBottom: spacing.xs }}>Open the Contacts tab on</Text>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
          Recent puts the people you've touched latest on top, with one-tap call, text, and email.
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(
            [
              ['all', 'All (A–Z)'],
              ['recent', 'Recent'],
            ] as const
          ).map(([value, label]) => {
            const active = contactsDefaultView === value;
            return (
              <View key={value} style={{ flex: 1 }}>
                <Button
                  title={label}
                  variant={active ? 'primary' : 'secondary'}
                  onPress={() => setContactsDefaultView(value)}
                />
              </View>
            );
          })}
        </View>
      </Card>

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        SCORING & GRADING
      </Text>
      <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
        {navRow(
          'stats-chart-outline',
          'Grading & scoring',
          'Interaction weights, decay, tier thresholds',
          '/(app)/settings/grading',
        )}
        {navRow(
          'color-palette-outline',
          'Rarity colors',
          'Choose a tier palette · premium options',
          '/(app)/settings/rarity',
        )}
      </View>

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        OUTREACH
      </Text>
      <View style={{ marginBottom: spacing.md }}>
        {navRow(
          'document-text-outline',
          'Message templates',
          'Saved texts & emails for blasts',
          '/(app)/settings/templates',
        )}
      </View>
      <Card style={{ marginBottom: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text weight="semibold">Leave me out of bulk messages</Text>
            <Text variant="caption" tone="muted">
              {meContactId
                ? 'Your ME card is skipped by text blasts, email blasts, and call lists.'
                : 'Takes effect once you set up your card on the Me tab.'}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Leave me out of bulk messages"
            value={excludeMeFromBulk}
            onValueChange={setExcludeMeFromBulk}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      </Card>

      {isFeatureEnabled('sync') ? (
        <>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
            SYNC
          </Text>
          <View style={{ marginBottom: spacing.xl }}>
            {navRow(
              'sync-outline',
              'Legend Sync',
              'Encrypted backup & multi-device sync · upgrade',
              '/(app)/settings/sync',
            )}
          </View>
        </>
      ) : null}

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        YOUR DATA
      </Text>
      <Card style={{ marginBottom: spacing.xl }}>
        <Text weight="semibold">Export everything</Text>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
          {`Shares contacts.csv and interactions.csv — your whole network (${contacts.length} contact${contacts.length === 1 ? '' : 's'}), yours to keep.`}
        </Text>
        <Button title="Export contacts to CSV" variant="secondary" loading={exporting} onPress={() => void exportCsv()} />
      </Card>

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        ACCOUNT
      </Text>
      <View style={{ gap: spacing.md, marginBottom: spacing.xl }}>
        <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
        <Button title="Delete account" variant="danger" onPress={confirmDelete} loading={busy} />
      </View>

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        SUPPORT
      </Text>
      <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
        {(
          [
            ['bug-outline', 'Report a bug', 'Something broken? Email us the details', 'bug'],
            ['bulb-outline', 'Share a suggestion', 'Ideas to make Legend better', 'suggestion'],
          ] as const
        ).map(([icon, title, subtitle, kind]) => (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={title}
            onPress={() => void emailSupport(kind)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: pressed ? colors.surfaceAlt : colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            })}
          >
            <Ionicons name={icon} size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text weight="semibold">{title}</Text>
              <Text variant="caption" tone="muted">{subtitle}</Text>
            </View>
            <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
          </Pressable>
        ))}
        {navRow(
          'play-circle-outline',
          'View the tutorial',
          'Replay the four-screen intro to Legend',
          '/(app)/tutorial',
        )}
      </View>

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        ABOUT
      </Text>
      <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Privacy policy"
          onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: pressed ? colors.surfaceAlt : colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          })}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text weight="semibold" style={{ flex: 1 }}>Privacy policy</Text>
          <Ionicons name="open-outline" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="About Legend"
          onPress={() => void WebBrowser.openBrowserAsync(ABOUT_URL)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: pressed ? colors.surfaceAlt : colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          })}
        >
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text weight="semibold" style={{ flex: 1 }}>About Legend</Text>
          <Ionicons name="open-outline" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <View
        style={{
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceAlt,
        }}
      >
        <Text variant="caption" tone="muted">
          Legend by Unjaded Digital Products · signed in as {user?.email}
        </Text>
      </View>
    </Screen>
  );
}
