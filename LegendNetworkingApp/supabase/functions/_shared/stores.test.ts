// Run: npx -y deno@2 test supabase/functions/_shared/stores.test.ts
// Proves the store-API JWTs are signed in a form the stores accept (ES256
// raw r||s for Apple, RS256 for Google) from PEM keys like the real secrets.

import { decodeJwsPayload, signJwt } from './stores.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function pemOf(key: CryptoKey): Promise<string> {
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', key));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  // Secrets often arrive with literal "\n" — the signer must cope.
  return `-----BEGIN PRIVATE KEY-----\\n${btoa(bin)}\\n-----END PRIVATE KEY-----`;
}

async function verifies(jwt: string, pub: CryptoKey, alg: AlgorithmIdentifier | EcdsaParams): Promise<boolean> {
  const [h, p, s] = jwt.split('.');
  return crypto.subtle.verify(alg, pub, b64urlToBytes(s!), new TextEncoder().encode(`${h}.${p}`));
}

Deno.test('ES256 JWT (Apple App Store Server API) verifies', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwt = await signJwt({ alg: 'ES256', kid: 'K' }, { iss: 'I', bid: 'com.x' }, await pemOf(pair.privateKey), 'ES256');
  assert(await verifies(jwt, pair.publicKey, { name: 'ECDSA', hash: 'SHA-256' }), 'ES256 signature did not verify');
  assert(b64urlToBytes(jwt.split('.')[2]!).length === 64, 'ES256 signature must be raw 64-byte r||s');
  assert(decodeJwsPayload<{ bid: string }>(jwt).bid === 'com.x', 'payload round-trip');
});

Deno.test('RS256 JWT (Google service account) verifies', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwt = await signJwt({ alg: 'RS256', typ: 'JWT' }, { iss: 'sa@x' }, await pemOf(pair.privateKey), 'RS256');
  assert(await verifies(jwt, pair.publicKey, { name: 'RSASSA-PKCS1-v1_5' }), 'RS256 signature did not verify');
});
