// app/(app)/followers.tsx
// Follower management for the acting vendor: remove, block, or unblock.

import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/features/auth/AuthContext';
import { vendorToolsService } from '../../src/features/vendorTools';
import { useAsyncAction } from '../../src/lib/useAsyncAction';
import type { AppUser, Vendor } from '../../src/backend/types';

export default function FollowersScreen() {
  const { user } = useAuth();
  const { spacing } = useTheme();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [followers, setFollowers] = useState<AppUser[]>([]);
  // Each row spins on its own, keyed by the follower's id.
  const { error, isBusy, run } = useAsyncAction();

  // Plain fetch: it throws, and every caller runs it inside run().
  const fetchFollowers = useCallback(async () => {
    if (!user) return;
    const v = await vendorToolsService.getByOwner(user.id);
    setVendor(v);
    if (v) setFollowers(await vendorToolsService.listFollowers(v.id));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void run(fetchFollowers);
    }, [run, fetchFollowers]),
  );

  const act = (fn: () => Promise<void>, id: string) =>
    run(async () => {
      await fn();
      await fetchFollowers();
    }, id);

  const blocked = vendor?.blockedUserIds ?? [];

  return (
    <Screen padded={false}>
      <FlatList
        data={followers}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Text variant="title" weight="bold">
              Followers ({followers.length})
            </Text>
            <Banner kind="error" message={error} />
          </View>
        }
        ListEmptyComponent={
          <Text tone="muted" style={{ marginTop: spacing.xl }} center>
            No followers yet.
          </Text>
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }}>
            <Text weight="semibold">{item.displayName}</Text>
            {item.username ? (
              <Text tone="muted" variant="caption">
                @{item.username}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Remove"
                  variant="secondary"
                  loading={isBusy(item.id)}
                  onPress={() => vendor && void act(() => vendorToolsService.removeFollower(vendor.id, item.id), item.id)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Block"
                  variant="danger"
                  loading={isBusy(item.id)}
                  onPress={() => vendor && void act(() => vendorToolsService.blockFollower(vendor.id, item.id), item.id)}
                />
              </View>
            </View>
          </Card>
        )}
        ListFooterComponent={
          blocked.length ? (
            <View style={{ marginTop: spacing.lg }}>
              <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
                BLOCKED ({blocked.length})
              </Text>
              {blocked.map((uid) => (
                <Card key={uid} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                      {uid}
                    </Text>
                    <Button
                      title="Unblock"
                      variant="secondary"
                      fullWidth={false}
                      loading={isBusy(uid)}
                      onPress={() => vendor && void act(() => vendorToolsService.unblockFollower(vendor.id, uid), uid)}
                    />
                  </View>
                </Card>
              ))}
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
