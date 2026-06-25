// src/screens/AdminDashboardScreen.js
// BackendAdmin-only dashboard: list users and impersonate any of them.

import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as backend from '../services/backend';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboardScreen() {
  const { realUser, impersonate, isImpersonating, stopImpersonating } = useAuth();
  const [users, setUsers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [u, v] = await Promise.all([backend.listUsers(), backend.listVendors()]);
    setUsers(u);
    setVendors(v);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!realUser || realUser.role !== 'admin') {
    return <Text style={styles.empty}>Admin access required.</Text>;
  }

  const renderUser = ({ item }) => {
    const v = vendors.find(x => x.ownerId === item.id);
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.displayName}</Text>
          <Text style={styles.meta}>
            @{item.username} · {item.role}
            {v ? ` · vendor "${v.name}"` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.impBtn}
          onPress={async () => {
            try { await impersonate(item.id); }
            catch (e) { console.warn(e); }
          }}
          disabled={item.id === realUser.id}
        >
          <Text style={styles.impBtnText}>
            {item.id === realUser.id ? 'You' : 'Impersonate'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Admin Dashboard</Text>
        <Text style={styles.muted}>
          {users.length} users · {vendors.length} vendors
        </Text>
        {isImpersonating ? (
          <TouchableOpacity onPress={stopImpersonating} style={styles.stopBtn}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Stop impersonating</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={users}
        keyExtractor={u => u.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={renderUser}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  h1: { fontSize: 22, fontWeight: '800', color: '#222' },
  muted: { color: '#666', marginTop: 2 },
  stopBtn: {
    marginTop: 10, backgroundColor: '#c00', padding: 10,
    borderRadius: 8, alignItems: 'center',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 12, borderRadius: 10, marginVertical: 4,
  },
  name: { fontWeight: '700', color: '#222' },
  meta: { color: '#666', fontSize: 12, marginTop: 2 },
  impBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#4a6cf7', borderRadius: 8,
  },
  impBtnText: { color: '#fff', fontWeight: '700' },
});
