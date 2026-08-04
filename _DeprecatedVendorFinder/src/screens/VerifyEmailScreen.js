// src/screens/VerifyEmailScreen.js
// Hard gate shown to any authenticated user whose email is not yet verified.
// Until verification succeeds, NONE of the app's features are reachable — this
// screen fully replaces the app navigation (see App.js).
//
// Two flows:
//   - Supabase: the user clicks a confirmation link in their email, then taps
//     "I've verified my email" to re-check (refreshSession).
//   - Local/demo backend: a 6-digit code is generated (logged to console) and
//     entered here to confirm.

import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { mode as backendMode } from '../services/backend';

const isLocal = backendMode !== 'supabase';

export default function VerifyEmailScreen() {
  const {
    realUser, signOut, refreshSession, resendVerification, confirmVerification,
  } = useAuth();

  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Resend cooldown timer.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Supabase: poll for verification so clicking the email link auto-advances.
  useEffect(() => {
    if (isLocal) return;
    const id = setInterval(() => { recheck(true); }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recheck = async (silent = false) => {
    if (!silent) setChecking(true);
    try {
      const user = await refreshSession();
      if (!user?.emailVerified && !silent) {
        Alert.alert('Not verified yet', 'We could not confirm your email yet. Open the link we emailed you, then try again.');
      }
    } catch (e) {
      if (!silent) Alert.alert('Error', e.message);
    } finally {
      if (!silent) setChecking(false);
    }
  };

  const onResend = async () => {
    setBusy(true);
    try {
      const res = await resendVerification();
      if (res?.alreadyVerified) {
        await refreshSession();
        return;
      }
      setCooldown(30);
      Alert.alert(
        'Sent',
        isLocal
          ? 'A new demo code was generated. Check the console/log for the 6-digit code.'
          : 'We re-sent the verification email. Check your inbox (and spam).'
      );
    } catch (e) {
      Alert.alert('Could not resend', e.message);
    } finally {
      setBusy(false);
    }
  };

  const onConfirmCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      await confirmVerification(code.trim());
      // Success: realUser.emailVerified flips → App.js swaps to the app.
    } catch (e) {
      Alert.alert('Invalid code', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.icon}>✉️</Text>
      <Text style={styles.title}>Verify your email</Text>
      <Text style={styles.sub}>
        We sent a verification {isLocal ? 'code' : 'link'} to
      </Text>
      <Text style={styles.email}>{realUser?.email || 'your email address'}</Text>
      <Text style={styles.body}>
        You must verify your email before you can use Vendor Finder.
        {isLocal
          ? ' Enter the 6-digit code below.'
          : ' Open the link in that email, then tap the button below.'}
      </Text>

      {isLocal ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.disabled]}
            onPress={onConfirmCode}
            disabled={busy}
          >
            <Text style={styles.primaryBtnText}>
              {busy ? 'Verifying…' : 'Verify'}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity
          style={[styles.primaryBtn, checking && styles.disabled]}
          onPress={() => recheck(false)}
          disabled={checking}
        >
          {checking
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>I&apos;ve verified my email</Text>}
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.secondaryBtn, (busy || cooldown > 0) && styles.disabled]}
        onPress={onResend}
        disabled={busy || cooldown > 0}
      >
        <Text style={styles.secondaryBtnText}>
          {cooldown > 0
            ? `Resend in ${cooldown}s`
            : isLocal ? 'Resend code' : 'Resend email'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={signOut} style={{ marginTop: 22 }}>
        <Text style={styles.link}>Use a different account / Sign out</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 28, justifyContent: 'center', backgroundColor: '#fff' },
  icon: { fontSize: 48, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#222', textAlign: 'center', marginTop: 12 },
  sub: { textAlign: 'center', color: '#666', marginTop: 12 },
  email: { textAlign: 'center', color: '#4a6cf7', fontWeight: '700', marginTop: 2 },
  body: { textAlign: 'center', color: '#555', marginTop: 14, lineHeight: 20 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, marginTop: 22,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, letterSpacing: 6,
    textAlign: 'center', backgroundColor: '#fafafa',
  },
  primaryBtn: {
    backgroundColor: '#4a6cf7', borderRadius: 10, padding: 15,
    alignItems: 'center', marginTop: 18, minHeight: 50, justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { padding: 13, alignItems: 'center', marginTop: 10 },
  secondaryBtnText: { color: '#4a6cf7', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  link: { color: '#888', textAlign: 'center', fontWeight: '600' },
});
