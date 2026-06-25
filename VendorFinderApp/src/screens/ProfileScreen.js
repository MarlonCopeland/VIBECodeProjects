// src/screens/ProfileScreen.js
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useVendors } from '../context/VendorContext';
import * as backend from '../services/backend';
import VendorCard from '../components/VendorCard';

export default function ProfileScreen({ navigation }) {
  const { currentUser, signOut, refreshUser, upgradeToVendor } = useAuth();
  const { vendors, favorites, toggleFavorite } = useVendors();
  const [newInterest, setNewInterest] = useState('');

  const followed = useMemo(
    () => vendors.filter(v => favorites.includes(v.id)),
    [vendors, favorites]
  );

  if (!currentUser) return null;

  const addInterest = async () => {
    const i = newInterest.trim();
    if (!i) return;
    const list = currentUser.interests || [];
    if (list.includes(i)) return;
    await backend.updateUser(currentUser.id, { interests: [...list, i] });
    setNewInterest('');
    await refreshUser();
  };

  const removeInterest = async (i) => {
    const list = (currentUser.interests || []).filter(x => x !== i);
    await backend.updateUser(currentUser.id, { interests: list });
    await refreshUser();
  };

  const becomeVendor = async () => {
    if (currentUser.role === 'vendor') return;
    Alert.alert(
      'Become a Vendor',
      'Upgrade this account to a Vendor account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upgrade',
          onPress: async () => {
            try {
              await upgradeToVendor({
                name: currentUser.displayName || currentUser.username,
                type: 'Other',
                tags: [],
              });
              Alert.alert('Success', 'You are now a vendor.');
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{currentUser.displayName}</Text>
          <Text style={styles.handle}>@{currentUser.username}</Text>
          <Text style={styles.role}>
            {currentUser.role === 'admin' ? 'Backend Admin' :
             currentUser.role === 'vendor' ? 'Vendor' : 'User'}
          </Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={{ color: '#c00', fontWeight: '600' }}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {currentUser.role === 'vendor' && (
        <TouchableOpacity
          style={styles.editVendorBtn}
          onPress={() => navigation.navigate('EditVendorProfile')}
        >
          <Text style={styles.editVendorBtnText}>Edit Vendor Profile</Text>
        </TouchableOpacity>
      )}

      {currentUser.role === 'user' && (
        <TouchableOpacity style={styles.upgradeBtn} onPress={becomeVendor}>
          <Text style={styles.upgradeBtnText}>＋ Become a Vendor</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.section}>Interests</Text>
      <View style={styles.tagRow}>
        {(currentUser.interests || []).map(i => (
          <TouchableOpacity key={i} onLongPress={() => removeInterest(i)} style={styles.tag}>
            <Text style={styles.tagText}>{i}</Text>
            <Text style={styles.tagX} onPress={() => removeInterest(i)}>  ×</Text>
          </TouchableOpacity>
        ))}
        {(currentUser.interests || []).length === 0 && (
          <Text style={styles.muted}>None yet.</Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Add an interest (e.g. coffee)"
          placeholderTextColor="#999"
          value={newInterest}
          onChangeText={setNewInterest}
          onSubmitEditing={addInterest}
        />
        <TouchableOpacity onPress={addInterest} style={styles.addBtn}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>Vendors you follow</Text>
      {followed.length === 0 ? (
        <Text style={styles.muted}>You don't follow any vendors yet.</Text>
      ) : (
        followed.map(v => (
          <VendorCard
            key={v.id}
            vendor={v}
            isFavorite={true}
            onPress={() => navigation.navigate('VendorDetail', { id: v.id })}
            onToggleFavorite={() => toggleFavorite(v.id)}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 22, fontWeight: '800', color: '#222' },
  handle: { color: '#666', marginTop: 2 },
  role: { color: '#4a6cf7', marginTop: 4, fontWeight: '600' },
  signOutBtn: { padding: 8 },
  editVendorBtn: {
    marginTop: 14, padding: 12, backgroundColor: '#22a06b',
    borderRadius: 10, alignItems: 'center',
  },
  editVendorBtnText: { color: '#fff', fontWeight: '700' },
  upgradeBtn: {
    marginTop: 14, padding: 12, backgroundColor: '#f0a020',
    borderRadius: 10, alignItems: 'center',
  },
  upgradeBtnText: { color: '#fff', fontWeight: '700' },
  section: { marginTop: 22, fontSize: 16, fontWeight: '700', color: '#333' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#eef',
  },
  tagText: { color: '#226' },
  tagX: { color: '#226', fontWeight: '700' },
  muted: { color: '#888', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fafafa',
  },
  addBtn: {
    marginLeft: 8, paddingHorizontal: 16, justifyContent: 'center',
    backgroundColor: '#4a6cf7', borderRadius: 8,
  },
});
