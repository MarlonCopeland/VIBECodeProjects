// src/lib/secureStore.ts
// Hardware-backed secure storage for sensitive values (tokens, secrets).
// Uses expo-secure-store on native (Keychain / Keystore) and falls back to
// localStorage on web where SecureStore is unavailable.
//
// Use this for anything sensitive. Use `lib/storage.ts` for non-sensitive
// preferences (theme, onboarding flags, etc.).

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const webStore: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null =
  Platform.OS === 'web' && typeof globalThis !== 'undefined'
    ? ((globalThis as unknown as { localStorage?: Storage }).localStorage ?? null)
    : null;

export const secureStore = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return webStore?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      webStore?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      webStore?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

/**
 * SecureStore-backed storage adapter shaped for supabase-js `auth.storage`.
 * On native this keeps the session in the Keychain/Keystore rather than
 * AsyncStorage. Supabase requires the get/set/remove trio.
 */
export const supabaseSecureStorage = {
  getItem: (key: string) => secureStore.getItem(key),
  setItem: (key: string, value: string) => secureStore.setItem(key, value),
  removeItem: (key: string) => secureStore.removeItem(key),
};
