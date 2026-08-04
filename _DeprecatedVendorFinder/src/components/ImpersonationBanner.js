// src/components/ImpersonationBanner.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function ImpersonationBanner() {
  const { isImpersonating, currentUser, stopImpersonating } = useAuth();
  if (!isImpersonating) return null;
  return (
    <View style={styles.bar}>
      <Text style={styles.text}>
        Viewing as <Text style={{ fontWeight: '700' }}>{currentUser?.displayName}</Text> ({currentUser?.role})
      </Text>
      <TouchableOpacity onPress={stopImpersonating}>
        <Text style={styles.action}>Stop</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#222', paddingHorizontal: 14, paddingVertical: 8,
  },
  text: { color: '#fff', flex: 1, fontSize: 13 },
  action: { color: '#ffce56', fontWeight: '700' },
});
