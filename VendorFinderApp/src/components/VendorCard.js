// src/components/VendorCard.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function VendorCard({ vendor, isFavorite, onPress, onToggleFavorite }) {
  const distLabel =
    typeof vendor.distanceKm === 'number'
      ? `${vendor.distanceKm.toFixed(2)} km`
      : '—';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{vendor.name}</Text>
          <Text style={styles.meta}>{vendor.type} • Rating {vendor.rating}/5</Text>
          <Text style={styles.meta}>
            {vendor.isOpen ? 'Open now' : 'Closed'} • {distLabel}
          </Text>
          {vendor.currentLocation?.address ? (
            <Text style={styles.address} numberOfLines={1}>
              {vendor.currentLocation.address}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={onToggleFavorite} style={styles.star}>
          <Text style={{ fontSize: 22 }}>{isFavorite ? '★' : '☆'}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 14,
    marginVertical: 6,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  name: { fontSize: 17, fontWeight: '700', color: '#222' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  address: { fontSize: 12, color: '#888', marginTop: 4 },
  star: { padding: 4, marginLeft: 8 },
});
