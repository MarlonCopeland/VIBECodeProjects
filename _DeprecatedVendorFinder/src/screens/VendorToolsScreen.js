// src/screens/VendorToolsScreen.js
// Dashboard for the vendor's own controls: schedule, broadcast, followers.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as backend from '../services/backend';
import { useAuth } from '../context/AuthContext';
import { useVendors } from '../context/VendorContext';
import { notify } from '../services/notificationService';
import ScheduleItem from '../components/ScheduleItem';
import {
  NOTIFICATION_TYPE_LIST, getTier, canSend, requiresSubscription,
} from '../config/tiers';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function VendorToolsScreen({ navigation }) {
  const { currentUser } = useAuth();
  const { location } = useVendors();
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState({});
  const [followerCount, setFollowerCount] = useState(0);

  // schedule form
  const [day, setDay]     = useState('Mon');
  const [start, setStart] = useState('10:00');
  const [end, setEnd]     = useState('14:00');
  const [addr, setAddr]   = useState('');

  // notification form
  const [notifType, setNotifType] = useState(NOTIFICATION_TYPE_LIST[0].key);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    const v = await backend.getVendorByOwner(currentUser.id);
    setVendor(v);
    if (v) {
      const [weekly, followers] = await Promise.all([
        backend.getWeeklyUsage(v.id).catch(() => ({})),
        backend.listFollowers(v.id).catch(() => []),
      ]);
      setUsage(weekly || {});
      setFollowerCount(followers.length);
    }
    setLoading(false);
  }, [currentUser]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!vendor) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: '#666' }}>No vendor profile yet.</Text>
      </View>
    );
  }

  const tier = getTier(vendor.subscriptionTier);
  const gated = requiresSubscription(followerCount, vendor.subscriptionTier);

  const setOpen = async (v) => {
    const patch = { isOpen: v };
    if (v && location) {
      patch.currentLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address || '',
      };
    } else if (!v) {
      patch.currentLocation = null;
    }
    const updated = await backend.updateVendor(vendor.id, patch);
    setVendor(updated);
  };

  const addSlot = async () => {
    if (!start || !end) return;
    const entry = {
      day, start, end,
      address: addr || (location?.address || ''),
      latitude: location?.latitude ?? 0,
      longitude: location?.longitude ?? 0,
    };
    const updated = await backend.updateVendor(vendor.id, {
      schedule: [...(vendor.schedule || []), entry],
    });
    setVendor(updated);
    setAddr('');
  };

  const removeSlot = async (idx) => {
    const next = (vendor.schedule || []).filter((_, i) => i !== idx);
    const updated = await backend.updateVendor(vendor.id, { schedule: next });
    setVendor(updated);
  };

  const sendTyped = async () => {
    try {
      const res = await backend.sendNotification(vendor.id, {
        type: notifType,
        body: msg.trim(),
      });
      // Also surface a local notification immediately (real fan-out to other
      // followers' devices happens server-side via Expo Push on Supabase).
      await notify(res.notification.title, res.notification.body || '', {
        vendorId: vendor.id, type: notifType,
      });
      setMsg('');
      await load();
      Alert.alert('Sent', `Delivered to ${res.followers.length} follower(s).`);
    } catch (e) {
      if (e.code === 'QUOTA_EXCEEDED') {
        Alert.alert(
          'Weekly limit reached',
          `${e.message}\n\nUpgrade your plan to send more.`,
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'View plans', onPress: () => navigation.navigate('Subscription') },
          ]
        );
      } else {
        Alert.alert('Error', e.message);
      }
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>Vendor Tools</Text>
      <Text style={styles.h2}>{vendor.name} · {vendor.type}</Text>

      <View style={styles.card}>
        <View style={styles.openRow}>
          <View>
            <Text style={styles.cardTitle}>Open right now</Text>
            <Text style={styles.muted}>
              {vendor.isOpen ? 'Followers see you as open.' : 'You are marked closed.'}
            </Text>
          </View>
          <Switch value={vendor.isOpen} onValueChange={setOpen} />
        </View>
      </View>

      <TouchableOpacity
        style={styles.editBtn}
        onPress={() => navigation.navigate('EditVendorProfile')}>
        <Text style={styles.editBtnText}>Edit Profile (type, tags, description)</Text>
      </TouchableOpacity>

      {gated && (
        <TouchableOpacity
          style={styles.gateBanner}
          onPress={() => navigation.navigate('Subscription')}>
          <Text style={styles.gateText}>
            You have {followerCount} followers. Subscribe to keep notifying them ›
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.section}>Notify followers</Text>
      <View style={styles.card}>
        <Text style={styles.subLabel}>Notification type</Text>
        <View style={styles.typeRow}>
          {NOTIFICATION_TYPE_LIST.map((t) => {
            const decision = canSend(tier.id, t.key, usage);
            const active = notifType === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.typePill, active && styles.typePillActive]}
                onPress={() => setNotifType(t.key)}>
                <Text style={[styles.typePillText, active && { color: '#fff' }]}>
                  {t.emoji} {t.label}
                </Text>
                <Text style={[styles.typeQuota, active && { color: '#dfe7ff' }]}>
                  {decision.limit === Infinity ? '∞ left'
                    : `${Math.max(decision.remaining + (decision.allowed ? 1 : 0), 0)} left`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
          style={[styles.input, { height: 70 }]}
          multiline
          placeholder="Optional message — e.g. Open at Grand Park until 2pm!"
          placeholderTextColor="#999"
          value={msg}
          onChangeText={setMsg}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={sendTyped}>
          <Text style={styles.primaryBtnText}>Send to Followers</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.editBtn, { backgroundColor: '#7c3aed' }]}
        onPress={() => navigation.navigate('Subscription')}>
        <Text style={styles.editBtnText}>Manage Subscription · {tier.name}</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Schedule</Text>
      <View style={styles.card}>
        {(vendor.schedule || []).length === 0 && (
          <Text style={styles.muted}>No slots yet.</Text>
        )}
        {(vendor.schedule || []).map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <ScheduleItem entry={s} />
            </View>
            <TouchableOpacity onPress={() => removeSlot(i)} style={{ padding: 8 }}>
              <Text style={{ color: '#c00', fontWeight: '700' }}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}

        <Text style={styles.subLabel}>Add slot</Text>
        <View style={styles.dayRow}>
          {DAYS.map(d => (
            <TouchableOpacity key={d}
              style={[styles.dayPill, day === d && styles.dayPillActive]}
              onPress={() => setDay(d)}>
              <Text style={[styles.dayPillText, day === d && { color: '#fff' }]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={start} onChangeText={setStart}
            placeholder="10:00" placeholderTextColor="#aaa" />
          <TextInput style={[styles.input, { flex: 1 }]} value={end} onChangeText={setEnd}
            placeholder="14:00" placeholderTextColor="#aaa" />
        </View>
        <TextInput style={styles.input} value={addr} onChangeText={setAddr}
          placeholder={location?.address || 'Address'} placeholderTextColor="#aaa" />
        <TouchableOpacity style={styles.primaryBtn} onPress={addSlot}>
          <Text style={styles.primaryBtnText}>Add Slot</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.editBtn, { backgroundColor: '#444' }]}
        onPress={() => navigation.navigate('Followers')}>
        <Text style={styles.editBtnText}>Manage Followers</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 24, fontWeight: '800', color: '#222' },
  h2: { color: '#666', marginTop: 2, marginBottom: 14 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 12 },
  cardTitle: { fontWeight: '700', color: '#222' },
  openRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muted: { color: '#888', marginTop: 2 },
  editBtn: { backgroundColor: '#4a6cf7', padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  editBtnText: { color: '#fff', fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '700', color: '#333', marginTop: 8, marginBottom: 8 },
  subLabel: { marginTop: 14, marginBottom: 6, fontWeight: '600', color: '#444' },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  dayPill: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff',
  },
  dayPillActive: { backgroundColor: '#4a6cf7', borderColor: '#4a6cf7' },
  dayPillText: { color: '#444' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginTop: 6, backgroundColor: '#fafafa',
  },
  primaryBtn: { backgroundColor: '#22a06b', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  gateBanner: { backgroundColor: '#fef3c7', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  gateText: { color: '#92400e', fontWeight: '700' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  typePill: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', alignItems: 'center',
  },
  typePillActive: { backgroundColor: '#4a6cf7', borderColor: '#4a6cf7' },
  typePillText: { color: '#333', fontWeight: '600', fontSize: 12 },
  typeQuota: { color: '#888', fontSize: 10, marginTop: 2 },
});
