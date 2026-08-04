import React from 'react';
import { Stack } from 'expo-router';

export default function DocsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#002C6C',
        },
        headerTintColor: '#D4AF37',
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 18,
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'NAACP Governing Docs' 
        }} 
      />
      <Stack.Screen 
        name="bylaws" 
        options={{ 
          title: 'NAACP Branch Bylaws',
          headerTitle: 'Branch Bylaws'
        }} 
      />
      <Stack.Screen 
        name="constitution" 
        options={{ 
          title: 'NAACP National Constitution',
          headerTitle: 'National Constitution'
        }} 
      />
    </Stack>
  );
}
