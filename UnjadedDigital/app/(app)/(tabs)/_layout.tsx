// app/(app)/(tabs)/_layout.tsx
// Bottom tab bar. Tabs are rendered conditionally from the feature registry —
// disabling a module (e.g. FEATURE_PROFILE=false) removes its tab automatically.

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { isFeatureEnabled } from '../../../src/config/features';

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function TabsLayout() {
  const { colors } = useTheme();

  const icon =
    (name: IoniconName) =>
    ({ color, size }: { color: string; size: number }) => (
      <Ionicons name={name} color={color} size={size} />
    );

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: icon('home-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: icon('person-outline'),
          // Hide the tab entirely when the module is disabled.
          href: isFeatureEnabled('profile') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: icon('settings-outline'),
          href: isFeatureEnabled('settings') ? undefined : null,
        }}
      />
    </Tabs>
  );
}
