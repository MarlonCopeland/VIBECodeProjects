import React from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#D4AF37', // NAACP Gold
        tabBarInactiveTintColor: '#FFFFFF',
        tabBarStyle: {
          backgroundColor: '#002C6C', // NAACP Deep Imperial Blue
          borderTopWidth: 1,
          borderTopColor: '#D4AF37',
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 88 : 64,
        },
        headerStyle: {
          backgroundColor: '#002C6C',
          borderBottomWidth: 1,
          borderBottomColor: '#D4AF37',
        },
        headerTintColor: '#D4AF37',
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 18,
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Card',
          headerTitle: 'NAACP Member Portal',
          tabBarLabel: 'My Card',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? "card" : "card-outline"} 
              size={size} 
              color={color} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="docs"
        options={{
          title: 'Bylaws & Charter',
          headerShown: false, // Nesting handles own headers
          tabBarLabel: 'Documents',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? "document-text" : "document-text-outline"} 
              size={size} 
              color={color} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="unit"
        options={{
          title: 'My Branch',
          headerTitle: 'NAACP Assigned Unit',
          tabBarLabel: 'My Unit',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? "business" : "business-outline"} 
              size={size} 
              color={color} 
            />
          ),
        }}
      />
    </Tabs>
  );
}
