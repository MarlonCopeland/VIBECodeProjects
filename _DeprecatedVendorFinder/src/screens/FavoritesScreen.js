// src/screens/FavoritesScreen.js
import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useVendors } from '../context/VendorContext';
import VendorCard from '../components/VendorCard';

export default function FavoritesScreen({ navigation }) {
  const { vendors, favorites, toggleFavorite } = useVendors();
  const list = useMemo(
    () => vendors.filter(v => favorites.includes(v.id)),
    [vendors, favorites]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={list}
        keyExtractor={v => v.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No favorites yet. Tap the star on any vendor to follow them.
          </Text>
        }
        renderItem={({ item }) => (
          <VendorCard
            vendor={item}
            isFavorite={true}
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
  empty: { textAlign: 'center', color: '#888', marginTop: 32, paddingHorizontal: 24 },
});
