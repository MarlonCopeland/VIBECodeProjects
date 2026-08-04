// app/(app)/(tabs)/vendor-tools.tsx
// Vendor control center (vendor role only): open toggle, typed broadcasts with
// weekly-quota enforcement, schedule editor, and links to edit the vendor
// profile / manage followers / manage subscription.

import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { Banner } from '../../../src/components/Banner';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAuth } from '../../../src/features/auth/AuthContext';
import { useVendors } from '../../../src/features/vendors/VendorContext';
import { ScheduleItem } from '../../../src/features/vendors/components/ScheduleItem';
import { vendorToolsService } from '../../../src/features/vendorTools';
import { NOTIFICATION_TYPE_LIST } from '../../../src/features/payments';
import { toAppError } from '../../../src/lib/errors';
import type { NotificationTypeKey, ScheduleSlot, Vendor } from '../../../src/backend/types';

export default function VendorToolsScreen() {
  const { user } = useAuth();
  const { location } = useVendors();
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Broadcast state
  const [type, setType] = useState<NotificationTypeKey>('open_for_business');
  const [message, setMessage] = useState('');

  // Schedule draft
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [address, setAddress] = useState('');

  const loadVendor = useCallback(() => {
    if (!user) return;
    vendorToolsService
      .getByOwner(user.id)
      .then(setVendor)
      .catch((e) => setError(toAppError(e).message));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadVendor();
    }, [loadVendor]),
  );

  if (!vendor) {
    return (
      <Screen center>
        <Text tone="muted" center>
          No vendor record found for your account.
        </Text>
      </Screen>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.code === 'QUOTA_EXCEEDED' ? `${err.message} Upgrade your plan to send more.` : toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleOpen = () =>
    run(async () => {
      const next = !vendor.isOpen;
      const updated = await vendorToolsService.setOpen(
        vendor.id,
        next,
        location ? { latitude: location.latitude, longitude: location.longitude, address: location.address } : null,
      );
      setVendor(updated);
      setNotice(next ? "You're now open." : "You're now closed.");
    });

  const sendBroadcast = () =>
    run(async () => {
      const res = await vendorToolsService.send(vendor.id, { type, body: message });
      setMessage('');
      setNotice(`Sent to ${res.followers.length} follower(s). ${res.remaining} left this week.`);
    });

  const addSlot = () =>
    run(async () => {
      if (!day || !start || !end) {
        setError('Day, start, and end are required for a schedule slot.');
        return;
      }
      const slot: ScheduleSlot = {
        day,
        start,
        end,
        address: address || location?.address || null,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      };
      const updated = await vendorToolsService.setSchedule(vendor.id, [...vendor.schedule, slot]);
      setVendor(updated);
      setDay('');
      setStart('');
      setEnd('');
      setAddress('');
    });

  const removeSlot = (index: number) =>
    run(async () => {
      const updated = await vendorToolsService.setSchedule(
        vendor.id,
        vendor.schedule.filter((_, i) => i !== index),
      );
      setVendor(updated);
    });

  return (
    <Screen scroll>
      <Text variant="title" weight="bold">
        {vendor.name}
      </Text>
      <Text tone="muted" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        {vendor.type} • {vendor.subscriptionTier} plan
      </Text>

      <Banner kind="error" message={error} />
      <Banner kind="success" message={notice} />

      {/* Open toggle */}
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text weight="semibold">Open right now</Text>
            <Text tone="muted" variant="caption" style={{ marginTop: 2 }}>
              {vendor.isOpen ? 'Customers can see you are open.' : 'You are currently closed.'}
            </Text>
          </View>
          <Button
            title={vendor.isOpen ? 'Close' : 'Open'}
            variant={vendor.isOpen ? 'secondary' : 'primary'}
            fullWidth={false}
            loading={busy}
            onPress={toggleOpen}
          />
        </View>
      </Card>

      {/* Broadcast */}
      <Card style={{ marginBottom: spacing.lg }}>
        <Text weight="semibold" style={{ marginBottom: spacing.sm }}>
          Send an alert to followers
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
          {NOTIFICATION_TYPE_LIST.map((nt) => {
            const active = type === nt.key;
            return (
              <Pressable
                key={nt.key}
                onPress={() => setType(nt.key)}
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
                  {nt.emoji} {nt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextField
          value={message}
          onChangeText={setMessage}
          placeholder="Optional message…"
          multiline
        />
        <Button title="Send alert" loading={busy} onPress={sendBroadcast} />
      </Card>

      {/* Schedule editor */}
      <Card style={{ marginBottom: spacing.lg }}>
        <Text weight="semibold" style={{ marginBottom: spacing.sm }}>
          Schedule
        </Text>
        {vendor.schedule.length ? (
          vendor.schedule.map((s, i) => (
            <View key={`${s.day}-${i}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <ScheduleItem entry={s} />
              </View>
              <Pressable onPress={() => removeSlot(i)} hitSlop={8} style={{ paddingLeft: spacing.sm }}>
                <Text tone="danger" variant="label">
                  Remove
                </Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text tone="muted" variant="caption" style={{ marginBottom: spacing.sm }}>
            No slots yet.
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <TextField label="Day" value={day} onChangeText={setDay} placeholder="Mon" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Start" value={start} onChangeText={setStart} placeholder="11:00" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="End" value={end} onChangeText={setEnd} placeholder="14:00" />
          </View>
        </View>
        <TextField label="Address (optional)" value={address} onChangeText={setAddress} placeholder="Grand Park, LA" />
        <Button title="Add slot" variant="secondary" loading={busy} onPress={addSlot} />
      </Card>

      <Button title="Edit vendor profile" variant="secondary" onPress={() => router.push('/(app)/vendor/edit')} />
      <View style={{ marginTop: spacing.md }}>
        <Button title="Manage followers" variant="secondary" onPress={() => router.push('/(app)/followers')} />
      </View>
      <View style={{ marginTop: spacing.md }}>
        <Button title="Manage subscription" variant="secondary" onPress={() => router.push('/(app)/subscription')} />
      </View>
    </Screen>
  );
}
