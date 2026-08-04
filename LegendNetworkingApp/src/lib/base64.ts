// src/lib/base64.ts
// Minimal byte<->base64 helpers with zero dependencies. Hermes doesn't
// reliably ship atob/btoa (and they're string-oriented anyway), so the sync
// engine's ciphertext envelopes use these.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const REVERSE: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) REVERSE[ALPHABET[i]!] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += ALPHABET[b0 >> 2]!;
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)]!;
    out += i + 1 < bytes.length ? ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)]! : '=';
    out += i + 2 < bytes.length ? ALPHABET[b2 & 0x3f]! : '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\s=]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const value = REVERSE[ch];
    if (value === undefined) throw new Error('Invalid base64 input');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIndex++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, outIndex);
}
