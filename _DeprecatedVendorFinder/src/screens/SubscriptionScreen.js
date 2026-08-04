// src/screens/SubscriptionScreen.js
// Vendor-facing subscription management. Shows the data-driven tiers, the
// vendor's follower count vs. the gate, current plan + weekly usage, and
// upgrade / manage actions routed through the pluggable paymentService.

import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import * as backend from '../services/backend';
import * as payments from '../services/payments';
import {
  TIERS, FREE_TIER, FOLLOWER_GATE, getTier, requiresSubscription, UNLIMITED,
  QUOTA_BUCKETS,
} from '../config/tiers';

export default function SubscriptionScreen() {
  const { currentUser } = useAuth();
  const [vendor, setVendor] = useState(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyTier, setBusyTier] = useState(null);

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const v = await backend.getVendorByOwner(currentUser.id);
      setVendor(v);
      if (v) {
        const [followers, weekly] = await Promise.all([
          backend.listFollowers(v.id),
          backend.getWeeklyUsage(v.id),
        ]);
        setFollowerCount(followers.length);
        setUsage(weekly || {});
      }
    } catch (e) {
      console.warn('subscription load failed', e);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!vendor) {
    return (
      <View style={styles.empty}><Text style={{ color: '#666' }}>No vendor profile.</Text></View>
    );
  }

  const currentTier = getTier(vendor.subscriptionTier);
  const gated = requiresSubscription(followerCount, vendor.subscriptionTier);

  const onChoose = async (tier) => {
    setBusyTier(tier.id);
    try {
      const res = await payments.subscribe({ vendorId: vendor.id, tier, currentUser });
      if (res.status === 'completed') {
        Alert.alert('Subscribed', `You are now on ${tier.name}.`);
        await load();
      } else if (res.status === 'redirect') {
        // web: page is navigating away to Stripe Checkout
      } else {
        Alert.alert('Continue in browser', 'Complete checkout, then return to the app.');
      }
    } catch (e) {
      Alert.alert('Checkout failed', e.message);
    } finally {
      setBusyTier(null);
    }
  };

  const onManage = async () => {
    try {
      const res = await payments.manageBilling({ vendorId: vendor.id, currentUser });
      if (res.status === 'completed') { await load(); }
      else if (res.status === 'unsupported') {
        Alert.alert('Unavailable', 'Billing management is not available.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const fmtLimit = (n) => (n === UNLIMITED ? '∞' : n);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>Subscription</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLine}>
          Current plan: <Text style={styles.bold}>{currentTier.name}</Text>
        </Text>
        <Text style={styles.statusLine}>
          Followers: <Text style={styles.bold}>{followerCount}</Text>
          {'  '}(gate at {FOLLOWER_GATE})
        </Text>
        {gated && (
          <Text style={styles.warn}>
            You’ve reached {FOLLOWER_GATE}+ followers. A paid plan is required to
            keep notifying followers.
          </Text>
        )}

        <Text style={[styles.statusLine, { marginTop: 8 }]}>This week’s usage</Text>
        <Text style={styles.usage}>
          Open For Business: {usage[QUOTA_BUCKETS.OPEN] || 0} /{' '}
          {fmtLimit(currentTier.weeklyQuota[QUOTA_BUCKETS.OPEN] ?? 0)}
        </Text>
        <Text style={styles.usage}>
          Sale / Stock: {usage[QUOTA_BUCKETS.PROMOTIONS] || 0} /{' '}
          {fmtLimit(currentTier.weeklyQuota[QUOTA_BUCKETS.PROMOTIONS] ?? 0)}
        </Text>
        {currentTier.weeklyQuota[QUOTA_BUCKETS.COMBINED] != null && (
          <Text style={styles.usage}>
            Any type (total): {usage[QUOTA_BUCKETS.COMBINED] || 0} /{' '}
            {fmtLimit(currentTier.weeklyQuota[QUOTA_BUCKETS.COMBINED])}
          </Text>
        )}
      </View>

      {TIERS.map((tier) => {
        const isCurrent = tier.id === currentTier.id;
        return (
          <View key={tier.id} style={[styles.tierCard, isCurrent && styles.tierCurrent]}>
            <View style={styles.tierHead}>
              <Text style={styles.tierName}>{tier.name}</Text>
              <Text style={styles.tierPrice}>
                {tier.priceMonthly === 0 ? 'Free' : `$${tier.priceMonthly.toFixed(2)}/mo`}
              </Text>
            </View>
            {tier.features.map((f, i) => (
              <Text key={i} style={styles.feature}>• {f}</Text>
            ))}
            {isCurrent ? (
              tier.id === FREE_TIER.id ? (
                <Text style={styles.currentBadge}>Current plan</Text>
              ) : (
                <TouchableOpacity style={styles.manageBtn} onPress={onManage}>
                  <Text style={styles.manageBtnText}>Manage / Cancel</Text>
                </TouchableOpacity>
              )
            ) : tier.id !== FREE_TIER.id ? (
              <TouchableOpacity
                style={[styles.chooseBtn, busyTier === tier.id && { opacity: 0.6 }]}
                disabled={!!busyTier}
                onPress={() => onChoose(tier)}
              >
                <Text style={styles.chooseBtnText}>
                  {busyTier === tier.id ? 'Starting…' :
                   tier.order > currentTier.order ? `Upgrade to ${tier.name}` : `Switch to ${tier.name}`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}

      <Text style={styles.note}>
        Payments are processed by {payments.activeProviderId()}. You can change
        or cancel your plan at any time.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 24, fontWeight: '800', color: '#222', marginBottom: 12 },
  statusCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  statusLine: { color: '#333', marginTop: 2 },
  bold: { fontWeight: '800', color: '#222' },
  warn: { color: '#b45309', marginTop: 8, fontWeight: '600' },
  usage: { color: '#555', marginTop: 2 },
  tierCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  tierCurrent: { borderColor: '#22a06b' },
  tierHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tierName: { fontSize: 18, fontWeight: '800', color: '#222' },
  tierPrice: { fontSize: 16, fontWeight: '700', color: '#4a6cf7' },
  feature: { color: '#444', marginTop: 3 },
  chooseBtn: { backgroundColor: '#4a6cf7', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12 },
  chooseBtnText: { color: '#fff', fontWeight: '700' },
  manageBtn: { backgroundColor: '#444', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12 },
  manageBtnText: { color: '#fff', fontWeight: '700' },
  currentBadge: { marginTop: 12, color: '#22a06b', fontWeight: '700' },
  note: { color: '#888', fontSize: 12, marginTop: 8, marginBottom: 30 },
});
