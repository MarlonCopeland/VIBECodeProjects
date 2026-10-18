// expo-crypto over WebCrypto (Chromium in Electron has all of it).

export enum CryptoDigestAlgorithm {
  SHA256 = 'SHA-256',
  SHA512 = 'SHA-512',
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export function getRandomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function getRandomBytesAsync(n: number): Promise<Uint8Array> {
  return getRandomBytes(n);
}

export async function digestStringAsync(algorithm: CryptoDigestAlgorithm, data: string): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
