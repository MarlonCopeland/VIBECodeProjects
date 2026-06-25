// src/screens/AlertsScreen.js
import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAlertHistory, clearAlertHistory } from '../services/notificationService';

export default function AlertsScreen() {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const h = await getAlertHistory();
    setItems(h);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onClear = async () => {
    await clearAlertHistory();
    setItems([]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        <TouchableOpacity onPress={onClear}>
          <Text style={styles.clear}>Clear</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No alerts yet. Favorite some vendors to get notified when they open or are nearby.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowBody}>{item.body}</Text>
            <Text style={styles.rowTime}>{new Date(item.at).toLocaleString()}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: '700' },
  clear: { color: '#c00', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', marginTop: 32, paddingHorizontal: 24 },
  row: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginVertical: 6 },
  rowTitle: { fontWeight: '700', color: '#222' },
  rowBody: { color: '#555', marginTop: 4 },
  rowTime: { color: '#999', fontSize: 11, marginTop: 6 },
});
