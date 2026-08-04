// src/features/sync/vaultKey.ts
// The vault key: 32 random bytes generated ON DEVICE the first time sync is
// enabled, stored in the Keychain/Keystore (expo-secure-store), and NEVER
// sent to any server — this is what makes the relay zero-knowledge. To link
// a second device, the user transfers the base64 "recovery key" themselves
// (Settings → Legend Sync); the server can't do it for them by design.

import * as Crypto from 'expo-crypto';
import { secureStore } from '../../lib/secureStore';
import { base64ToBytes, bytesToBase64 } from '../../lib/base64';

const KEY_STORE_KEY = 'legend.sync.vaultKey';
const KEY_BYTES = 32;

let cached: Uint8Array | null = null;

/** The stored vault key, or null if this device has none yet. */
export async function getVaultKey(): Promise<Uint8Array | null> {
  if (cached) return cached;
  const raw = await secureStore.getItem(KEY_STORE_KEY);
  if (!raw) return null;
  try {
    const bytes = base64ToBytes(raw);
    if (bytes.length !== KEY_BYTES) return null;
    cached = bytes;
    return bytes;
  } catch {
    return null;
  }
}

/** Get the vault key, generating and persisting a fresh one if missing. */
export async function ensureVaultKey(): Promise<Uint8Array> {
  const existing = await getVaultKey();
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(KEY_BYTES);
  const key = new Uint8Array(bytes);
  await secureStore.setItem(KEY_STORE_KEY, bytesToBase64(key));
  cached = key;
  return key;
}

/** Base64 recovery key for display / manual transfer to another device. */
export async function exportRecoveryKey(): Promise<string> {
  return bytesToBase64(await ensureVaultKey());
}

/** Install a recovery key transferred from another device (replaces any). */
export async function importRecoveryKey(recoveryKey: string): Promise<void> {
  const bytes = base64ToBytes(recoveryKey.trim());
  if (bytes.length !== KEY_BYTES) {
    throw new Error('That does not look like a Legend recovery key.');
  }
  await secureStore.setItem(KEY_STORE_KEY, bytesToBase64(bytes));
  cached = bytes;
}

/** Short non-secret fingerprint of the key (SHA-256 prefix) for key_id. */
export async function vaultKeyId(key: Uint8Array): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytesToBase64(key),
  );
  return digest.slice(0, 12);
}
