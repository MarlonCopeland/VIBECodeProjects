// src/services/backend/supabaseClient.js
// Lazily-initialized Supabase client configured for React Native / Expo.
// Uses AsyncStorage for session persistence and disables URL session
// detection (we handle OAuth redirects manually via expo-auth-session).

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/env';

let client = null;

export function getSupabase() {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY ' +
      'in your environment (see .env.example) or use APP_BACKEND=local.'
    );
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
