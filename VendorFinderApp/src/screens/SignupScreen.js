// src/screens/SignupScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const VENDOR_TYPES = ['Food', 'Clothes', 'Activity', 'Electronics', 'Arts', 'Services', 'Other'];

export default function SignupScreen({ navigation }) {
  const { signUp } = useAuth();
  const [role, setRole]               = useState('user');
  const [username, setUsername]       = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [displayName, setDisplayName] = useState('');
  const [vendorName, setVendorName]   = useState('');
  const [vendorType, setVendorType]   = useState('Food');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!username || !password) {
      Alert.alert('Missing info', 'Username and password required.');
      return;
    }
    setBusy(true);
    try {
      await signUp({
        username, email, password, displayName,
        role,
        vendorName: role === 'vendor' ? (vendorName || displayName || username) : undefined,
        vendorType: role === 'vendor' ? vendorType : undefined,
      });
    } catch (e) {
      Alert.alert('Sign-up failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create account</Text>

      <Text style={styles.label}>I am a…</Text>
      <View style={styles.roleRow}>
        {['user', 'vendor'].map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.rolePill, role === r && styles.rolePillActive]}
            onPress={() => setRole(r)}
          >
            <Text style={[styles.rolePillText, role === r && { color: '#fff' }]}>
              {r === 'user' ? 'User' : 'Vendor'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput style={styles.input} placeholder="Username *" placeholderTextColor="#999"
        autoCapitalize="none" autoCorrect={false}
        value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999"
        keyboardType="email-address" autoCapitalize="none"
        value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Display name" placeholderTextColor="#999"
        value={displayName} onChangeText={setDisplayName} />
      <TextInput style={styles.input} placeholder="Password (min 6) *" placeholderTextColor="#999"
        secureTextEntry value={password} onChangeText={setPassword} />

      {role === 'vendor' && (
        <>
          <Text style={styles.label}>Vendor name</Text>
          <TextInput style={styles.input} placeholder="e.g. Marlon's Tacos" placeholderTextColor="#999"
            value={vendorName} onChangeText={setVendorName} />
          <Text style={styles.label}>Vendor type</Text>
          <View style={styles.typeRow}>
            {VENDOR_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.typePill, vendorType === t && styles.typePillActive]}
                onPress={() => setVendorType(t)}
              >
                <Text style={[styles.typePillText, vendorType === t && { color: '#fff' }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity
        style={[styles.btn, busy && { opacity: 0.6 }]}
        onPress={onSubmit} disabled={busy}
      >
        <Text style={styles.btnText}>{busy ? 'Creating…' : 'Create Account'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 16 }}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60, backgroundColor: '#fff', flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '800', color: '#222', marginBottom: 18 },
  label: { fontWeight: '600', color: '#444', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
    backgroundColor: '#fafafa', marginBottom: 10,
  },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  rolePill: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#ccc', alignItems: 'center', backgroundColor: '#fff',
  },
  rolePillActive: { backgroundColor: '#4a6cf7', borderColor: '#4a6cf7' },
  rolePillText: { color: '#444', fontWeight: '600' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typePill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff',
  },
  typePillActive: { backgroundColor: '#4a6cf7', borderColor: '#4a6cf7' },
  typePillText: { color: '#444' },
  btn: { backgroundColor: '#4a6cf7', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 18 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link: { color: '#4a6cf7', textAlign: 'center', fontWeight: '600' },
});
