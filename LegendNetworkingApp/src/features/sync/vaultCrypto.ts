// src/features/sync/vaultCrypto.ts
// The encryption envelope for everything the sync engine sends off-device:
// XChaCha20-Poly1305 (AEAD) from @noble/ciphers — pure JS, audited, runs in
// Expo Go and on web. payload = base64( 24-byte nonce || ciphertext ), which
// is exactly what the server's `sync_changes.payload` column stores. The
// server never sees the key, so it can hold the data without being able to
// read it.

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils';
import * as Crypto from 'expo-crypto';
import { base64ToBytes, bytesToBase64 } from '../../lib/base64';

const NONCE_BYTES = 24;

/** Encrypt any JSON-serializable value into a payload string. */
export async function sealPayload(key: Uint8Array, value: unknown): Promise<string> {
  const nonce = new Uint8Array(await Crypto.getRandomBytesAsync(NONCE_BYTES));
  const plaintext = utf8ToBytes(JSON.stringify(value));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return bytesToBase64(out);
}

/** Decrypt a payload string. Throws on wrong key or tampered data. */
export function openPayload<T>(key: Uint8Array, payload: string): T {
  const raw = base64ToBytes(payload);
  if (raw.length <= NONCE_BYTES) throw new Error('Payload too short');
  const nonce = raw.subarray(0, NONCE_BYTES);
  const ciphertext = raw.subarray(NONCE_BYTES);
  const plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);
  return JSON.parse(bytesToUtf8(plaintext)) as T;
}
