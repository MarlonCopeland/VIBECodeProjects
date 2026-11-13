// src/platform/secureStore.ts
// Desktop replacement for ../LegendNetworkingApp/src/lib/secureStore.ts
// (swapped in by vite.config.ts). Same exports, but secrets — the Supabase
// session and the Legend Sync vault key — are encrypted with the OS keychain
// via Electron safeStorage instead of sitting in localStorage.

import { deleteItemAsync, getItemAsync, setItemAsync } from './shims/expo-secure-store';

export const secureStore = {
  getItem: (key: string) => getItemAsync(key),
  setItem: (key: string, value: string) => setItemAsync(key, value),
  removeItem: (key: string) => deleteItemAsync(key),
};

export const supabaseSecureStorage = {
  getItem: (key: string) => secureStore.getItem(key),
  setItem: (key: string, value: string) => secureStore.setItem(key, value),
  removeItem: (key: string) => secureStore.removeItem(key),
};
