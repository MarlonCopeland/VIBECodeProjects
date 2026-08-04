// src/screens/SearchScreen.js
import React, { useMemo, useState } from 'react';
import { View, FlatList, StyleSheet, Text, Switch } from 'react-native';
import { useVendors } from '../context/VendorContext';
import VendorCard from '../components/VendorCard';
import SearchBar from '../components/SearchBar';

export default function SearchScreen({ navigation }) {
  const { vendors, favorites, toggleFavorite } = useVendors();
  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter(v => {
      if (openOnly && !v.isOpen) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.type.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q)
      );
    });
  }, [vendors, query, openOnly]);

  return (
    <View style={styles.container}>
      <SearchBar value={query} onChangeText={setQuery} />
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Open now only</Text>
        <Switch value={openOnly} onValueChange={setOpenOnly} />
      </View>
      <FlatList
        data={results}
        keyExtractor={v => v.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Text style={styles.empty}>No matches.</Text>}
        renderItem={({ item }) => (
          <VendorCard
            vendor={item}
            isFavorite={favorites.includes(item.id)}
            onPress={() => navigation.navigate('VendorDetail', { id: item.id })}
            onToggleFavorite={() => toggleFavorite(item.id)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 6,
  },
  filterLabel: { color: '#555' },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
});
