// src/screens/FollowersScreen.js
// Vendor view of their followers, with block/remove controls.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as backend from '../services/backend';
import { useAuth } from '../context/AuthContext';

export default function FollowersScreen() {
  const { currentUser } = useAuth();
  const [vendor, setVendor] = useState(null);
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    const v = await backend.getVendorByOwner(currentUser.id);
    setVendor(v);
    if (v) {
      const f = await backend.listFollowers(v.id);
      setFollowers(f);
    }
    setLoading(false);
  }, [currentUser]);

  useEffect(() => { reload(); }, [reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!vendor) return <Text style={styles.empty}>No vendor profile.</Text>;

  const remove = (u) => {
    Alert.alert('Remove follower', `Remove ${u.displayName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive',
        onPress: async () => { await backend.removeFollower(vendor.id, u.id); reload(); } },
    ]);
  };

  const block = (u) => {
    Alert.alert('Block follower',
      `${u.displayName} will be removed and prevented from following or seeing you.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive',
        onPress: async () => { await backend.blockFollower(vendor.id, u.id); reload(); } },
    ]);
  };

  const unblock = async (userId) => {
    await backend.unblockFollower(vendor.id, userId);
    reload();
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={followers}
        keyExtractor={u => u.id}
        contentContainerStyle={{ padding: 12 }}
        ListHeaderComponent={
          <Text style={styles.heading}>{followers.length} follower(s)</Text>
        }
        ListEmptyComponent={<Text style={styles.empty}>No followers yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.handle}>@{item.username}</Text>
            </View>
            <TouchableOpacity onPress={() => remove(item)} style={[styles.btn, { backgroundColor: '#777' }]}>
              <Text style={styles.btnText}>Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => block(item)} style={[styles.btn, { backgroundColor: '#c00', marginLeft: 6 }]}>
              <Text style={styles.btnText}>Block</Text>
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          (vendor.blockedUserIds || []).length === 0 ? null : (
            <View style={{ marginTop: 24 }}>
              <Text style={styles.heading}>Blocked users</Text>
              {(vendor.blockedUserIds || []).map(id => (
                <View key={id} style={styles.row}>
                  <Text style={{ flex: 1, color: '#555' }}>{id}</Text>
                  <TouchableOpacity onPress={() => unblock(id)}
                    style={[styles.btn, { backgroundColor: '#22a06b' }]}>
                    <Text style={styles.btnText}>Unblock</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  heading: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 8 },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 12, borderRadius: 10, marginVertical: 4,
  },
  name: { fontWeight: '700', color: '#222' },
  handle: { color: '#666', fontSize: 12 },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600' },
});
