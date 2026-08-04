// src/lib/storage.ts
// Non-sensitive key/value storage for preferences (theme, flags, cache).
// AsyncStorage on native, localStorage on web. For secrets use secureStore.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const webStore: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null =
  Platform.OS === 'web' && typeof globalThis !== 'undefined'
    ? ((globalThis as unknown as { localStorage?: Storage }).localStorage ?? null)
    : null;

export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return webStore?.getItem(key) ?? null;
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      webStore?.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      webStore?.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  },
};
