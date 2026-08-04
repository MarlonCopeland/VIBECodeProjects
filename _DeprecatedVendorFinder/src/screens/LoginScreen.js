// src/screens/LoginScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { signIn, signInWithProvider } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!identifier || !password) {
      Alert.alert('Missing info', 'Email/username and password required.');
      return;
    }
    setBusy(true);
    try {
      // Pass as both so email-based (Supabase) and username-based (local)
      // backends each find what they need.
      await signIn({ username: identifier, email: identifier, password });
    } catch (e) {
      Alert.alert('Sign-in failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const onProvider = async (p) => {
    setBusy(true);
    try {
      await signInWithProvider(p);
    } catch (e) {
      Alert.alert('Sign-in failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Vendor Finder</Text>
      <Text style={styles.sub}>Sign in to continue</Text>

      <TextInput
        style={styles.input} placeholder="Email or username" placeholderTextColor="#999"
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
        value={identifier} onChangeText={setIdentifier}
      />
      <TextInput
        style={styles.input} placeholder="Password" placeholderTextColor="#999"
        secureTextEntry value={password} onChangeText={setPassword}
      />

      <TouchableOpacity
        style={[styles.btn, busy && styles.btnDisabled]}
        onPress={onSubmit} disabled={busy}
      >
        <Text style={styles.btnText}>{busy ? 'Signing in…' : 'Sign In'}</Text>
      </TouchableOpacity>

      <View style={styles.divider}><Text style={styles.dividerText}>or</Text></View>

      <TouchableOpacity style={[styles.btn, styles.google]} onPress={() => onProvider('google')}>
        <Text style={styles.btnText}>Continue with Google</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, styles.facebook]} onPress={() => onProvider('facebook')}>
        <Text style={styles.btnText}>Continue with Facebook</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={{ marginTop: 18 }}>
        <Text style={styles.link}>Don't have an account? Sign up</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Demo admin: username <Text style={{ fontWeight: '700' }}>admin</Text> / password <Text style={{ fontWeight: '700' }}>admin123</Text>
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center', color: '#222' },
  sub: { textAlign: 'center', color: '#666', marginTop: 4, marginBottom: 24 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  btn: {
    backgroundColor: '#4a6cf7', borderRadius: 10, padding: 14,
    alignItems: 'center', marginTop: 6,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  google:   { backgroundColor: '#db4437', marginTop: 8 },
  facebook: { backgroundColor: '#3b5998', marginTop: 8 },
  divider: { alignItems: 'center', marginVertical: 14 },
  dividerText: { color: '#888' },
  link: { color: '#4a6cf7', textAlign: 'center', fontWeight: '600' },
  hint: { marginTop: 20, textAlign: 'center', color: '#888', fontSize: 12 },
});
