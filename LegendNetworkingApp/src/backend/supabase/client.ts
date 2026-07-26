// src/backend/supabase/client.ts
// Lazily-initialized Supabase client tuned for React Native / Expo.
//
// Session persistence uses SecureStore (Keychain/Keystore) on native so auth
// tokens are hardware-protected rather than sitting in AsyncStorage.
// `detectSessionInUrl` is off because we handle OAuth + reset redirects
// explicitly via expo-linking / expo-auth-session.

import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../config/env';
import { supabaseSecureStorage } from '../../lib/secureStore';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in ' +
        'your .env (see .env.example), or set APP_BACKEND=local to use the demo backend.',
    );
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: supabaseSecureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
