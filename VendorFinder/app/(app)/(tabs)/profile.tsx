// app/(app)/(tabs)/profile.tsx
// Profile summary: identity + role, interest tags, followed vendors, a
// "become a vendor" upgrade for customers, and sign out.

import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { Banner } from '../../../src/components/Banner';
import { Avatar } from '../../../src/components/Avatar';
import { useAuth } from '../../../src/features/auth/AuthContext';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useVendors } from '../../../src/features/vendors/VendorContext';
import { profileService } from '../../../src/features/profile';
import { isFeatureEnabled } from '../../../src/config/features';
import { toAppError } from '../../../src/lib/errors';

export default function ProfileScreen() {
  const { user, realUser, setUser, signOut, upgradeToVendor } = useAuth();
  const { vendors, favorites } = useVendors();
  const { colors, spacing } = useTheme();
  const router = useRouter();

  const [interest, setInterest] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const interests = user?.interests ?? [];
  const followed = useMemo(() => vendors.filter((v) => favorites.includes(v.id)), [vendors, favorites]);
  // Only the real, un-impersonated user should mutate their own account here.
  const canEditOwn = !!user && user.id === realUser?.id;

  const saveInterests = async (next: string[]) => {
    if (!user) return;
    setError('');
    setBusy(true);
    try {
      const updated = await profileService.updateProfile(user.id, { interests: next });
      setUser(updated);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const addInterest = () => {
    const tag = interest.trim().toLowerCase();
    if (!tag || interests.includes(tag)) return;
    setInterest('');
    void saveInterests([...interests, tag]);
  };

  const becomeVendor = async () => {
    setError('');
    setBusy(true);
    try {
      await upgradeToVendor({ name: vendorName.trim() || `${user?.displayName}'s Stand` });
      setShowUpgrade(false);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <Avatar uri={user?.avatarUrl} name={user?.displayName} size={96} />
        <Text variant="heading" weight="semibold" style={{ marginTop: spacing.md }}>
          {user?.displayName}
        </Text>
        {user?.username ? <Text tone="muted">@{user.username}</Text> : null}
        <View
          style={{
            marginTop: spacing.xs,
            paddingVertical: 2,
            paddingHorizontal: spacing.md,
            backgroundColor: colors.surfaceAlt,
            borderRadius: 999,
          }}
        >
          <Text variant="caption" tone="primary" weight="semibold">
            {user?.role?.toUpperCase()}
          </Text>
        </View>
      </View>

      <Banner kind="error" message={error} />

      {/* Interests */}
      <Card style={{ marginBottom: spacing.lg }}>
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
          INTERESTS
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
          {interests.length ? (
            interests.map((tag) => (
              <Pressable
                key={tag}
                onPress={() => canEditOwn && void saveInterests(interests.filter((t) => t !== tag))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 2,
                  paddingHorizontal: spacing.sm,
                  backgroundColor: colors.surfaceAlt,
                  borderRadius: 999,
                }}
              >
                <Text variant="caption">#{tag}</Text>
                {canEditOwn ? (
                  <Text variant="caption" tone="muted" style={{ marginLeft: spacing.xs }}>
                    ✕
                  </Text>
                ) : null}
              </Pressable>
            ))
          ) : (
            <Text tone="muted" variant="caption">
              Add tags for what you&apos;re looking for.
            </Text>
          )}
        </View>
        {canEditOwn ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextField
                value={interest}
                onChangeText={setInterest}
                placeholder="e.g. coffee"
                autoCapitalize="none"
                onSubmitEditing={addInterest}
                returnKeyType="done"
              />
            </View>
            <Button title="Add" variant="secondary" fullWidth={false} loading={busy} onPress={addInterest} />
          </View>
        ) : null}
      </Card>

      {/* Followed vendors */}
      <Card style={{ marginBottom: spacing.lg }}>
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
          FOLLOWING ({followed.length})
        </Text>
        {followed.length ? (
          followed.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => router.push(`/(app)/vendor/${v.id}`)}
              style={{ paddingVertical: spacing.xs }}
            >
              <Text>{v.name}</Text>
            </Pressable>
          ))
        ) : (
          <Text tone="muted" variant="caption">
            Not following anyone yet.
          </Text>
        )}
      </Card>

      <Button title="Edit profile" onPress={() => router.push('/(app)/profile/edit')} />

      {/* Become a vendor (customers only, on their own account) */}
      {canEditOwn && user?.role === 'user' ? (
        <View style={{ marginTop: spacing.md }}>
          {showUpgrade ? (
            <Card>
              <Text weight="semibold" style={{ marginBottom: spacing.sm }}>
                Become a vendor
              </Text>
              <TextField
                label="Vendor name"
                value={vendorName}
                onChangeText={setVendorName}
                placeholder="Your stand's name"
              />
              <Button title="Create vendor account" loading={busy} onPress={becomeVendor} />
            </Card>
          ) : (
            <Button title="Become a vendor" variant="secondary" onPress={() => setShowUpgrade(true)} />
          )}
        </View>
      ) : null}

      {isFeatureEnabled('payments') && user?.role === 'vendor' ? (
        <View style={{ marginTop: spacing.md }}>
          <Button
            title="Manage subscription"
            variant="secondary"
            onPress={() => router.push('/(app)/subscription')}
          />
        </View>
      ) : null}

      <View style={{ marginTop: spacing.md }}>
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}
