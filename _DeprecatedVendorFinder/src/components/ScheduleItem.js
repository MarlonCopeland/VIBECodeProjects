// src/components/ScheduleItem.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ScheduleItem({ entry }) {
  return (
    <View style={styles.row}>
      <Text style={styles.day}>{entry.day}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.time}>{entry.start} – {entry.end}</Text>
        {entry.address ? <Text style={styles.addr}>{entry.address}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  day: { width: 50, fontWeight: '700', color: '#333' },
  time: { fontSize: 14, color: '#222' },
  addr: { fontSize: 12, color: '#777', marginTop: 2 },
});
