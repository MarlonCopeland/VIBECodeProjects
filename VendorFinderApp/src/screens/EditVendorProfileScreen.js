// src/screens/EditVendorProfileScreen.js
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import * as backend from '../services/backend';
import { useAuth } from '../context/AuthContext';

const VENDOR_TYPES = ['Food', 'Clothes', 'Activity', 'Electronics', 'Arts', 'Services', 'Other'];

export default function EditVendorProfileScreen({ navigation }) {
  const { currentUser } = useAuth();
  const [vendor, setVendor]           = useState(null);
  const [name, setName]               = useState('');
  const [type, setType]               = useState('Other');
  const [description, setDescription] = useState('');
  const [tags, setTags]               = useState([]);
  const [newTag, setNewTag]           = useState('');
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    backend.getVendorByOwner(currentUser.id).then(v => {
      if (v) {
        setVendor(v);
        setName(v.name);
        setType(v.type);
        setDescription(v.description || '');
        setTags(v.tags || []);
      }
    });
  }, [currentUser]);

  const addTag = () => {
    const t = newTag.trim().toLowerCase();
    if (!t || tags.includes(t)) { setNewTag(''); return; }
    setTags(prev => [...prev, t]);
    setNewTag('');
  };

  const removeTag = (t) => setTags(prev => prev.filter(x => x !== t));

  const save = async () => {
    if (!vendor) return;
    if (!name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    setSaving(true);
    try {
      await backend.updateVendor(vendor.id, { name: name.trim(), type, description, tags });
      Alert.alert('Saved', 'Vendor profile updated.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!vendor) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Edit Vendor Profile</Text>

      <Label text="Vendor name" />
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor="#999" />

      <Label text="Type" />
      <View style={styles.row}>
        {VENDOR_TYPES.map(t => (
          <TouchableOpacity key={t}
            style={[styles.pill, type === t && styles.pillActive]}
            onPress={() => setType(t)}>
            <Text style={[styles.pillText, type === t && { color: '#fff' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Label text="Description" />
      <TextInput
        style={[styles.input, { height: 90 }]}
        multiline value={description} onChangeText={setDescription}
        placeholderTextColor="#999"
      />

      <Label text="Tags (help users find you)" />
      <View style={styles.row}>
        {tags.map(t => (
          <TouchableOpacity key={t} onPress={() => removeTag(t)} style={[styles.pill, { backgroundColor: '#eef' }]}>
            <Text style={{ color: '#226' }}>{t} ×</Text>
          </TouchableOpacity>
        ))}
        {tags.length === 0 && <Text style={styles.muted}>None yet.</Text>}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="e.g. tacos"
          placeholderTextColor="#999"
          value={newTag}
          onChangeText={setNewTag}
          onSubmitEditing={addTag}
        />
        <TouchableOpacity onPress={addTag} style={styles.addBtn}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.save, saving && { opacity: 0.6 }]}
        onPress={save} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Label({ text }) { return <Text style={styles.label}>{text}</Text>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  label: { marginTop: 14, marginBottom: 6, fontWeight: '600', color: '#444' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fafafa',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: '#4a6cf7', borderColor: '#4a6cf7' },
  pillText: { color: '#444' },
  addBtn: {
    marginLeft: 8, paddingHorizontal: 16, justifyContent: 'center',
    backgroundColor: '#4a6cf7', borderRadius: 8,
  },
  muted: { color: '#888' },
  save: {
    marginTop: 24, padding: 14, backgroundColor: '#22a06b',
    borderRadius: 10, alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
