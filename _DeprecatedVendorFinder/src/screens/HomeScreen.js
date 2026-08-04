// src/screens/HomeScreen.js
import React, { useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useVendors } from '../context/VendorContext';
import VendorCard from '../components/VendorCard';

export default function HomeScreen({ navigation }) {
  const { vendors, favorites, location, loading, error, refresh, toggleFavorite } = useVendors();

  const sorted = useMemo(() => {
    return [...vendors].sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      const da = typeof a.distanceKm === 'number' ? a.distanceKm : Infinity;
      const db = typeof b.distanceKm === 'number' ? b.distanceKm : Infinity;
      return da - db;
    });
  }, [vendors]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Vendors Near You</Text>
        {location ? (
          <Text style={styles.sub} numberOfLines={1}>
            📍 {location.address || `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`}
          </Text>
        ) : (
          <Text style={styles.sub}>Locating you…</Text>
        )}
      </View>

      {error ? <Text style={styles.error}>Error: {error}</Text> : null}

      {loading && vendors.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={v => v.id}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No vendors yet. Pull to refresh.</Text>
          }
          renderItem={({ item }) => (
            <VendorCard
              vendor={item}
              isFavorite={favorites.includes(item.id)}
              onPress={() => navigation.navigate('VendorDetail', { id: item.id })}
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  header: { padding: 16, paddingTop: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 22, fontWeight: '700', color: '#222' },
  sub: { color: '#666', marginTop: 4 },
  error: { color: '#c00', padding: 12 },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
});
