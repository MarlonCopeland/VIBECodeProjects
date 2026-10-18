// expo-secure-store -> Electron safeStorage (OS keychain / DPAPI) in the main
// process. The shared src/lib/secureStore.ts would take its web branch
// (localStorage) under Platform.OS === 'web', so vite.config.ts redirects
// that module to ../secureStore.ts, which calls straight into this.

import { bridge } from '../bridge';

export function getItemAsync(key: string): Promise<string | null> {
  return bridge().secure.get(key);
}
export function setItemAsync(key: string, value: string): Promise<void> {
  return bridge().secure.set(key, value);
}
export function deleteItemAsync(key: string): Promise<void> {
  return bridge().secure.remove(key);
}
