// app/(app)/settings/sync.tsx
// Legend Sync: opt-in, paid upgrade (monthly / yearly-at-a-discount).
// Local data is always authoritative (SYNC_DESIGN.md); subscribing unlocks
// the encrypted change-log relay, and a per-device toggle opts this device
// in. Beta behavior is honest: unlocking is free (source='beta' rows only —
// RLS blocks the client from forging paid rows) until StoreKit billing lands.

import React, { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAppSettings } from '../../../src/features/settings/AppSettingsContext';
import {
  SYNC_PLANS,
  cancelSyncSubscription,
  getSyncSubscription,
  isSubscriptionActive,
  isSyncAvailable,
  subscribeToSyncBeta,
  type SyncPlanId,
  type SyncSubscription,
} from '../../../src/features/sync/subscriptionService';
import { notify } from '../../../src/lib/notify';

export default function SyncSettingsScreen() {
  const { colors, spacing } = useTheme();
  const { syncEnabled, setSyncEnabled } = useAppSettings();
  const [subscription, setSubscription] = useState<SyncSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<SyncPlanId | null>(null);
  const [canceling, setCanceling] = useState(false);

  const available = isSyncAvailable();
  const active = isSubscriptionActive(subscription);

  const load = useCallback(async () => {
    if (!available) {
      setLoading(false);
      return;
    }
    try {
      setSubscription(await getSyncSubscription());
    } catch (e) {
      notify('Could not load subscription', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [available]);

  useEffect(() => {
    void load();
  }, [load]);

  const subscribe = async (plan: SyncPlanId) => {
    setBusyPlan(plan);
    try {
      setSubscription(await subscribeToSyncBeta(plan));
      notify('Sync unlocked (beta)', 'Free during beta — billing arrives with the App Store release.');
    } catch (e) {
      notify('Could not subscribe', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPlan(null);
    }
  };

  const cancel = async () => {
    setCanceling(true);
    try {
      await cancelSyncSubscription();
      setSyncEnabled(false);
      await load();
      notify('Subscription canceled', 'Sync is off. Your local data is untouched.');
    } catch (e) {
      notify('Could not cancel', e instanceof Error ? e.message : String(e));
    } finally {
      setCanceling(false);
    }
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'Legend Sync' }} />

      <Card style={{ marginBottom: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Ionicons name="sync-outline" size={20} color={colors.primary} />
          <Text weight="semibold">Your data stays yours</Text>
        </View>
        <Text variant="caption" tone="muted">
          Legend is local-first: everything lives on this device and works fully offline, always.
          Sync is an optional upgrade that backs up your network and keeps your devices in step by
          relaying an end-to-end-encrypted change log — the server only ever sees ciphertext, never
          your contacts.
        </Text>
      </Card>

      {!available ? (
        <Card>
          <Text weight="semibold" style={{ marginBottom: spacing.xs }}>Not available in this build</Text>
          <Text variant="caption" tone="muted">
            This build uses the offline demo backend, which has no server to sync with. Sync is
            available in builds connected to a Legend account backend.
          </Text>
        </Card>
      ) : loading ? (
        <Card>
          <Text tone="muted">Loading subscription…</Text>
        </Card>
      ) : active ? (
        <>
          <Card style={{ marginBottom: spacing.xl, borderColor: colors.primary, borderWidth: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text weight="semibold">
                  Sync unlocked — {subscription?.plan === 'yearly' ? 'Yearly' : 'Monthly'} plan
                </Text>
                <Text variant="caption" tone="muted">
                  {subscription?.source === 'beta'
                    ? 'Free during beta. Billing starts with the App Store release; you can cancel any time.'
                    : 'Active subscription.'}
                </Text>
              </View>
            </View>
          </Card>

          <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
            THIS DEVICE
          </Text>
          <Card style={{ marginBottom: spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text weight="semibold">Sync on this device</Text>
                <Text variant="caption" tone="muted">
                  Opt this device into backup and multi-device sync. The sync engine ships in an
                  upcoming update — your subscription unlocks it the moment it arrives.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Sync on this device"
                value={syncEnabled}
                onValueChange={setSyncEnabled}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          </Card>

          <Button
            title="Cancel subscription"
            variant="danger"
            loading={canceling}
            onPress={() => void cancel()}
          />
        </>
      ) : (
        <>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
            CHOOSE A PLAN
          </Text>
          <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
            {SYNC_PLANS.map((plan) => (
              <Card key={plan.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text weight="semibold">{plan.name}</Text>
                    {plan.note ? (
                      <Text variant="caption" tone="primary" weight="semibold">{plan.note}</Text>
                    ) : null}
                  </View>
                  <Text variant="heading">{plan.price}</Text>
                  <Text variant="caption" tone="muted" style={{ marginLeft: 4 }}>{plan.cadence}</Text>
                </View>
                <Button
                  title={`Unlock with ${plan.name}`}
                  loading={busyPlan === plan.id}
                  onPress={() => void subscribe(plan.id)}
                />
              </Card>
            ))}
          </View>
          <Text variant="caption" tone="muted">
            Free to unlock during beta — real billing arrives with the App Store release. Canceling
            never touches the data on your device.
          </Text>
        </>
      )}
    </Screen>
  );
}
