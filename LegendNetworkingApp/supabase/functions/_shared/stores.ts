// supabase/functions/_shared/stores.ts
// Server-to-server purchase checks with Apple and Google. Nothing the phone
// sends is trusted on its own: the client's token only tells us WHICH
// transaction to look up, and the authoritative record comes back from the
// store over TLS.
//
// Secrets (supabase secrets set …):
//   APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY (the .p8
//   contents), APPLE_BUNDLE_ID — App Store Connect → Users and Access →
//   Integrations → In-App Purchase.
//   GOOGLE_SERVICE_ACCOUNT_JSON, ANDROID_PACKAGE_NAME — a service account
//   with "View financial data" + "Manage orders" in Play Console.

export interface StorePurchase {
  platform: 'ios' | 'android';
  /** iOS originalTransactionId / Android orderId — the stable purchase id. */
  transactionId: string;
  productId: string;
  /** iOS appAccountToken / Android obfuscatedExternalAccountId (= Legend user id when set). */
  accountToken: string | null;
  purchasedAt: string;
  environment: 'production' | 'sandbox';
  /** Purchased and not refunded/revoked. */
  valid: boolean;
  /** Android only: whether the purchase still needs acknowledging. */
  needsAck?: boolean;
}

// ---- encoding helpers -------------------------------------------------------

function b64urlEncode(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let bin = '';
  for (const b of data) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Decode a JWS payload WITHOUT verifying it — only for picking ids to look up. */
export function decodeJwsPayload<T>(jws: string): T {
  const part = jws.split('.')[1];
  if (!part) throw new Error('Malformed JWS');
  return JSON.parse(b64urlDecode(part)) as T;
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0)).buffer;
}

export async function signJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  pem: string,
  alg: 'ES256' | 'RS256',
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem),
    alg === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const input = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign(
    alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(input),
  );
  // WebCrypto ECDSA signatures are already raw r||s, which is what JWS wants.
  return `${input}.${b64urlEncode(new Uint8Array(sig))}`;
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Server is missing the ${name} secret.`);
  return v;
}

// ---- Apple: App Store Server API ------------------------------------------

interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  appAccountToken?: string;
  environment: 'Production' | 'Sandbox';
  revocationDate?: number;
}

async function appleToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    { alg: 'ES256', kid: env('APPLE_IAP_KEY_ID'), typ: 'JWT' },
    { iss: env('APPLE_IAP_ISSUER_ID'), iat: now, exp: now + 1200, aud: 'appstoreconnect-v1', bid: env('APPLE_BUNDLE_ID') },
    env('APPLE_IAP_PRIVATE_KEY'),
    'ES256',
  );
}

const APPLE_HOSTS = ['https://api.storekit.itunes.apple.com', 'https://api.storekit-sandbox.itunes.apple.com'];

/** Fetch a transaction from Apple (production first, then sandbox). */
export async function appleTransaction(transactionId: string): Promise<StorePurchase> {
  const token = await appleToken();
  for (const host of APPLE_HOSTS) {
    const res = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Apple verification failed (${res.status}).`);
    const { signedTransactionInfo } = (await res.json()) as { signedTransactionInfo: string };
    // Delivered by Apple over TLS in answer to our authenticated request.
    const t = decodeJwsPayload<AppleTransaction>(signedTransactionInfo);
    if (t.bundleId !== env('APPLE_BUNDLE_ID')) throw new Error('Purchase is for a different app.');
    return {
      platform: 'ios',
      transactionId: t.originalTransactionId,
      productId: t.productId,
      accountToken: t.appAccountToken?.toLowerCase() ?? null,
      purchasedAt: new Date(t.purchaseDate).toISOString(),
      environment: t.environment === 'Sandbox' ? 'sandbox' : 'production',
      valid: !t.revocationDate,
    };
  }
  throw new Error('Apple has no record of that purchase.');
}

/** iOS: the client's purchaseToken is the StoreKit 2 transaction JWS. */
export async function verifyApple(clientJws: string): Promise<StorePurchase> {
  const { transactionId } = decodeJwsPayload<{ transactionId?: string }>(clientJws);
  if (!transactionId) throw new Error('Missing transaction id.');
  return appleTransaction(transactionId);
}

// ---- Google: Play Developer API -------------------------------------------

interface GoogleProductPurchase {
  purchaseState?: number; // 0 purchased, 1 canceled, 2 pending
  acknowledgementState?: number; // 0 not yet, 1 acknowledged
  orderId?: string;
  purchaseTimeMillis?: string;
  obfuscatedExternalAccountId?: string;
  purchaseType?: number; // 0 = test (license tester)
}

let googleCache: { token: string; exp: number } | null = null;

async function googleToken(): Promise<string> {
  if (googleCache && googleCache.exp > Date.now() + 60_000) return googleCache.token;
  const sa = JSON.parse(env('GOOGLE_SERVICE_ACCOUNT_JSON')) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
    'RS256',
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google auth failed (${res.status}).`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  googleCache = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

function playUrl(productId: string, token: string, suffix = ''): string {
  const pkg = env('ANDROID_PACKAGE_NAME');
  return (
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}` +
    `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}${suffix}`
  );
}

export async function verifyGoogle(productId: string, purchaseToken: string): Promise<StorePurchase> {
  const res = await fetch(playUrl(productId, purchaseToken), {
    headers: { Authorization: `Bearer ${await googleToken()}` },
  });
  if (res.status === 404 || res.status === 400) throw new Error('Google Play has no record of that purchase.');
  if (!res.ok) throw new Error(`Google verification failed (${res.status}).`);
  const p = (await res.json()) as GoogleProductPurchase;
  return {
    platform: 'android',
    transactionId: p.orderId ?? purchaseToken,
    productId,
    accountToken: p.obfuscatedExternalAccountId?.toLowerCase() ?? null,
    purchasedAt: new Date(Number(p.purchaseTimeMillis ?? Date.now())).toISOString(),
    environment: p.purchaseType === 0 ? 'sandbox' : 'production',
    valid: p.purchaseState === 0,
    needsAck: p.acknowledgementState === 0,
  };
}

/** Acknowledge so Google doesn't auto-refund after 3 days (best-effort; the app also finishes it). */
export async function acknowledgeGoogle(productId: string, purchaseToken: string): Promise<void> {
  await fetch(playUrl(productId, purchaseToken, ':acknowledge'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => undefined);
}
