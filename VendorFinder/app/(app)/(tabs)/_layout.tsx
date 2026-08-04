// app/(app)/(tabs)/_layout.tsx
// Bottom tab bar. Tabs are rendered conditionally from the feature registry AND
// the acting user's role — disabling a module (e.g. FEATURE_ALERTS=false) or
// lacking a role removes the tab automatically (Expo Router `href: null`).

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { isFeatureEnabled } from '../../../src/config/features';
import { useAuth } from '../../../src/features/auth/AuthContext';

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function TabsLayout() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const role = user?.role;

  const icon =
    (name: IoniconName) =>
    ({ color, size }: { color: string; size: number }) => (
      <Ionicons name={name} color={color} size={size} />
    );

  const show = (cond: boolean) => (cond ? undefined : null);

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
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('search-outline') }} />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favorites',
          tabBarIcon: icon('star-outline'),
          href: show(isFeatureEnabled('favorites')),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: icon('notifications-outline'),
          href: show(isFeatureEnabled('alerts')),
        }}
      />
      <Tabs.Screen
        name="vendor-tools"
        options={{
          title: 'Vendor',
          tabBarIcon: icon('construct-outline'),
          href: show(isFeatureEnabled('vendorTools') && (role === 'vendor' || role === 'admin')),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: icon('shield-outline'),
          href: show(isFeatureEnabled('admin') && role === 'admin'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: icon('person-outline'),
          href: show(isFeatureEnabled('profile')),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: icon('settings-outline'),
          href: show(isFeatureEnabled('settings')),
        }}
      />
    </Tabs>
  );
}
