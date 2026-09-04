// app/(app)/(tabs)/admin.tsx
// Admin console: user directory with counts and one-tap impersonation.

import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { Banner } from '../../../src/components/Banner';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAuth } from '../../../src/features/auth/AuthContext';
import { adminService } from '../../../src/features/admin';
import { listVendors } from '../../../src/features/vendors/vendorService';
import { useAsyncAction } from '../../../src/lib/useAsyncAction';
import type { AppUser } from '../../../src/backend/types';

export default function AdminScreen() {
  const { realUser, impersonate } = useAuth();
  const { spacing } = useTheme();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [vendorCount, setVendorCount] = useState(0);
  const { error, run } = useAsyncAction();

  const load = useCallback(
    () =>
      run(async () => {
        const [u, v] = await Promise.all([adminService.listUsers(), listVendors()]);
        setUsers(u);
        setVendorCount(v.length);
      }),
    [run],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const act = (userId: string) => run(() => impersonate(userId));

  return (
    <Screen padded={false}>
      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Text variant="title" weight="bold">
              Admin
            </Text>
            <Text tone="muted" style={{ marginTop: spacing.xs }}>
              {users.length} users • {vendorCount} vendors
            </Text>
            <Banner kind="error" message={error} />
          </View>
        }
        renderItem={({ item }) => {
          const isSelf = item.id === realUser?.id;
          return (
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text weight="semibold">{item.displayName}</Text>
                  <Text tone="muted" variant="caption" style={{ marginTop: 2 }}>
                    {item.role}
                    {item.vendorId ? ' • has vendor' : ''} • {item.emailVerified ? 'verified' : 'unverified'}
                  </Text>
                </View>
                <Button
                  title={isSelf ? 'You' : 'Impersonate'}
                  variant="secondary"
                  fullWidth={false}
                  disabled={isSelf}
                  onPress={() => void act(item.id)}
                />
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}
