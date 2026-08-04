// App.js
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { VendorProvider } from './src/context/VendorContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import VendorDetailScreen from './src/screens/VendorDetailScreen';
import VendorToolsScreen from './src/screens/VendorToolsScreen';
import EditVendorProfileScreen from './src/screens/EditVendorProfileScreen';
import FollowersScreen from './src/screens/FollowersScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';
import VerifyEmailScreen from './src/screens/VerifyEmailScreen';

import ImpersonationBanner from './src/components/ImpersonationBanner';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function tabIcon(symbol) {
  return ({ color, size }) => (
    <Text style={{ color, fontSize: size }}>{symbol}</Text>
  );
}

// Role-aware tabs. The acting (possibly impersonated) user drives visibility.
function MainTabs() {
  const { currentUser } = useAuth();
  const role = currentUser?.role;

  return (
    <Tab.Navigator screenOptions={{ headerShown: true }}>
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ tabBarIcon: tabIcon('🏠') }} />
      <Tab.Screen name="Search" component={SearchScreen}
        options={{ tabBarIcon: tabIcon('🔍') }} />
      <Tab.Screen name="Favorites" component={FavoritesScreen}
        options={{ tabBarIcon: tabIcon('★') }} />
      <Tab.Screen name="Alerts" component={AlertsScreen}
        options={{ tabBarIcon: tabIcon('🔔') }} />
      {role === 'vendor' && (
        <Tab.Screen name="VendorTools" component={VendorToolsScreen}
          options={{ tabBarIcon: tabIcon('🛠'), title: 'Vendor' }} />
      )}
      {role === 'admin' && (
        <Tab.Screen name="Admin" component={AdminDashboardScreen}
          options={{ tabBarIcon: tabIcon('⚙️') }} />
      )}
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarIcon: tabIcon('👤') }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Login" component={LoginScreen}
        options={{ headerShown: false }} />
      <Stack.Screen name="Signup" component={SignupScreen}
        options={{ title: 'Sign up' }} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" component={MainTabs}
        options={{ headerShown: false }} />
      <Stack.Screen name="VendorDetail" component={VendorDetailScreen}
        options={{ title: 'Vendor' }} />
      <Stack.Screen name="EditVendorProfile" component={EditVendorProfileScreen}
        options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="Followers" component={FollowersScreen}
        options={{ title: 'Followers' }} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen}
        options={{ title: 'Subscription' }} />
    </Stack.Navigator>
  );
}

function Root() {
  const { currentUser, loading, emailVerified } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Auth gate:
  //   - signed in, unverified -> VerifyEmailScreen ONLY (no app features,
  //     rendered outside the navigator so nothing else is reachable)
  if (currentUser && !emailVerified) {
    return <VerifyEmailScreen />;
  }

  //   - no session          -> AuthStack (login/signup)
  //   - signed in + verified -> AppStack (full app)
  return (
    <>
      <ImpersonationBanner />
      <NavigationContainer>
        {currentUser ? <AppStack /> : <AuthStack />}
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <VendorProvider>
          <Root />
          <StatusBar style="auto" />
        </VendorProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
