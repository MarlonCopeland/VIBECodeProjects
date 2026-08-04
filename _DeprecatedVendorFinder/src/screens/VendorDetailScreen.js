// src/screens/VendorDetailScreen.js
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useVendors } from '../context/VendorContext';
import * as backend from '../services/backend';
import ScheduleItem from '../components/ScheduleItem';

export default function VendorDetailScreen({ route }) {
  const { id } = route.params;
  const { favorites, toggleFavorite } = useVendors();
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    backend.getVendor(id).then(v => {
      setVendor(v);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!vendor) return <Text style={styles.missing}>Vendor not found.</Text>;

  const fav = favorites.includes(vendor.id);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{vendor.name}</Text>
      <Text style={styles.type}>{vendor.type}</Text>
      <Text style={styles.status}>
        {vendor.isOpen ? 'Open now' : 'Closed'} • Rating {vendor.rating}/5
      </Text>

      <TouchableOpacity
        style={[styles.button, fav && styles.buttonActive]}
        onPress={() => toggleFavorite(vendor.id)}
      >
        <Text style={styles.buttonText}>
          {fav ? '★ Favorited (tap to unfavorite)' : '☆ Add to favorites'}
        </Text>
      </TouchableOpacity>

      {vendor.description ? (
        <>
          <Text style={styles.section}>About</Text>
          <Text style={styles.body}>{vendor.description}</Text>
        </>
      ) : null}

      {vendor.currentLocation ? (
        <>
          <Text style={styles.section}>Currently at</Text>
          <Text style={styles.body}>{vendor.currentLocation.address || 'Unknown'}</Text>
          <Text style={styles.coords}>
            {vendor.currentLocation.latitude.toFixed(4)}, {vendor.currentLocation.longitude.toFixed(4)}
          </Text>
        </>
      ) : null}

      <Text style={styles.section}>Upcoming schedule</Text>
      {vendor.schedule && vendor.schedule.length ? (
        vendor.schedule.map((s, i) => <ScheduleItem key={i} entry={s} />)
      ) : (
        <Text style={styles.body}>No schedule posted yet.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  missing: { textAlign: 'center', marginTop: 40, color: '#888' },
  title: { fontSize: 24, fontWeight: '800', color: '#222' },
  type: { color: '#666', marginTop: 4 },
  status: { color: '#444', marginTop: 4 },
  button: {
    marginTop: 16, padding: 12, borderRadius: 8,
    backgroundColor: '#4a6cf7', alignItems: 'center',
  },
  buttonActive: { backgroundColor: '#22a06b' },
  buttonText: { color: '#fff', fontWeight: '600' },
  section: { marginTop: 20, fontSize: 16, fontWeight: '700', color: '#333' },
  body: { marginTop: 6, color: '#444', lineHeight: 20 },
  coords: { color: '#888', fontSize: 12, marginTop: 2 },
});
