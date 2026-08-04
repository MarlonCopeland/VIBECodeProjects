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
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAppSettings } from '../../../src/features/settings/AppSettingsContext';
import { useSync } from '../../../src/features/sync/SyncProvider';
import { exportRecoveryKey, importRecoveryKey } from '../../../src/features/sync/vaultKey';
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
  const { colors, spacing, radius } = useTheme();
  const { syncEnabled, setSyncEnabled } = useAppSettings();
  const { syncState, syncNow, recheckEntitlement } = useSync();
  const [subscription, setSubscription] = useState<SyncSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<SyncPlanId | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [importing, setImporting] = useState(false);

  const revealKey = async () => {
    try {
      setRecoveryKey(await exportRecoveryKey());
    } catch (e) {
      notify('Could not load key', e instanceof Error ? e.message : String(e));
    }
  };

  const copyKey = async () => {
    if (!recoveryKey) return;
    await Clipboard.setStringAsync(recoveryKey);
    notify('Copied', 'Recovery key copied — store it somewhere safe.');
  };

  const doImportKey = async () => {
    setImporting(true);
    try {
      await importRecoveryKey(keyInput);
      setKeyInput('');
      setRecoveryKey(null);
      notify('Key installed', 'This device now uses the imported recovery key.');
      void syncNow();
    } catch (e) {
      notify('Invalid key', e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

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
      await recheckEntitlement();
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
      await recheckEntitlement();
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
                  Opt this device into encrypted backup and multi-device sync. Changes push
                  automatically as you work and pull live from your other devices.
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

          {syncEnabled ? (
            <>
              <Card style={{ marginBottom: spacing.xl }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text weight="semibold">
                      {syncState.status === 'syncing'
                        ? 'Syncing…'
                        : syncState.status === 'error'
                          ? 'Sync problem'
                          : 'Up to date'}
                    </Text>
                    <Text variant="caption" tone={syncState.status === 'error' ? 'danger' : 'muted'}>
                      {syncState.status === 'error'
                        ? syncState.error
                        : syncState.lastSyncedAt
                          ? `Last synced ${new Date(syncState.lastSyncedAt).toLocaleString()}`
                          : 'Not synced yet on this device.'}
                    </Text>
                  </View>
                  <Button
                    title="Sync now"
                    variant="secondary"
                    loading={syncState.status === 'syncing'}
                    onPress={() => void syncNow()}
                  />
                </View>
              </Card>

              <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
                ENCRYPTION KEY
              </Text>
              <Card style={{ marginBottom: spacing.xl }}>
                <Text weight="semibold" style={{ marginBottom: spacing.xs }}>Recovery key</Text>
                <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
                  Your data is encrypted on this device before it leaves — the server (and we)
                  can never read it. This key is the ONLY way another device, or a future you,
                  can decrypt it. Save it somewhere safe; losing every device means losing the
                  backup.
                </Text>
                {recoveryKey ? (
                  <>
                    <View
                      style={{
                        padding: spacing.md,
                        borderRadius: radius.md,
                        backgroundColor: colors.surfaceAlt,
                        marginBottom: spacing.md,
                      }}
                    >
                      <Text selectable style={{ fontFamily: 'monospace' }}>{recoveryKey}</Text>
                    </View>
                    <Button title="Copy key" variant="secondary" onPress={() => void copyKey()} />
                  </>
                ) : (
                  <Button title="Reveal recovery key" variant="secondary" onPress={() => void revealKey()} />
                )}

                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />

                <Text weight="semibold" style={{ marginBottom: spacing.xs }}>Linking this device?</Text>
                <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
                  Paste the recovery key from the device that set up sync so both encrypt with
                  the same key.
                </Text>
                <TextField
                  label="Recovery key"
                  value={keyInput}
                  onChangeText={setKeyInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Paste key from your other device"
                />
                <View style={{ marginTop: spacing.md }}>
                  <Button
                    title="Use this key"
                    variant="secondary"
                    loading={importing}
                    onPress={() => void doImportKey()}
                  />
                </View>
              </Card>
            </>
          ) : null}

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
