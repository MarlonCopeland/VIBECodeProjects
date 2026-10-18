// src/features/suite/suiteService.ts
// Legend Full Suite: a one-time App Store / Google Play purchase that unlocks
// Legend for Windows/macOS/Linux and emails the download link.
//
// The phone never decides ownership itself. It buys through the store
// (expo-iap), binds the purchase to the Legend account (iOS appAccountToken /
// Android obfuscatedAccountId = Supabase user id), and hands the store token
// to the `verify-purchase` Edge Function, which re-checks it with
// Apple/Google, records it with the service role and sends the email. Only
// after the server accepts it is the transaction finished. See
// supabase/functions/README.md.

import { Platform } from 'react-native';
import { getSupabase } from '../../backend/supabase/client';
import { FULL_SUITE_PRODUCT_IDS, isSupabaseConfigured } from '../../config/env';
import { isFeatureEnabled } from '../../config/features';

type ExpoIap = typeof import('expo-iap');
type Purchase = import('expo-iap').Purchase;

let iapModule: ExpoIap | null | undefined;

/**
 * expo-iap is a native module: it exists in dev/EAS builds but not in Expo
 * Go or on web, where requiring it throws. Load lazily and treat a failure
 * as "store unavailable" rather than crashing the screen.
 */
export function iap(): ExpoIap | null {
  if (iapModule !== undefined) return iapModule;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return (iapModule = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    iapModule = require('expo-iap') as ExpoIap;
  } catch {
    iapModule = null;
  }
  return iapModule;
}

/** The store SKU for this platform. */
export function fullSuiteSku(): string {
  return Platform.OS === 'ios' ? FULL_SUITE_PRODUCT_IDS.ios : FULL_SUITE_PRODUCT_IDS.android;
}

/** The feature needs real accounts: purchases are bound to a Supabase user. */
export function fullSuiteEnabled(): boolean {
  return isFeatureEnabled('fullSuite') && isSupabaseConfigured;
}

/** Server-side truth: does the signed-in account own the Full Suite? */
export async function hasFullSuite(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('has_full_suite');
  if (error) throw new Error(error.message);
  return data === true;
}

/** Edge Function errors carry a JSON { error } body; surface that text. */
async function invoke<T>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>(name, { body: body ?? {} });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let message = error.message;
    try {
      const parsed = (await ctx?.json()) as { error?: string } | undefined;
      if (parsed?.error) message = parsed.error;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return data as T;
}

export interface VerifyResult {
  owned: boolean;
  firstTime: boolean;
  emailedTo: string | null;
  emailError: string | null;
}

export function verifyPurchase(purchase: Purchase): Promise<VerifyResult> {
  if (!purchase.purchaseToken) throw new Error('The store returned no purchase token.');
  return invoke<VerifyResult>('verify-purchase', {
    platform: Platform.OS,
    productId: purchase.productId,
    purchaseToken: purchase.purchaseToken,
  });
}

export function resendDownloadLink(): Promise<{ sent: boolean; emailedTo: string }> {
  return invoke('send-download-link');
}

/**
 * Verify with the server, THEN finish the store transaction. If verification
 * fails the transaction stays open, so StoreKit replays it next launch and
 * Google keeps it un-acknowledged — nothing is lost.
 */
export async function verifyAndFinish(purchase: Purchase): Promise<VerifyResult> {
  const result = await verifyPurchase(purchase);
  await iap()?.finishTransaction({ purchase, isConsumable: false });
  return result;
}

/** Start the store purchase sheet. The outcome arrives on purchaseUpdatedListener. */
export async function startPurchase(userId: string): Promise<void> {
  const m = iap();
  if (!m) throw new Error('Purchases need the App Store or Google Play build of Legend.');
  await m.requestPurchase({
    type: 'in-app',
    request: {
      apple: { sku: fullSuiteSku(), appAccountToken: userId },
      google: { skus: [fullSuiteSku()], obfuscatedAccountId: userId },
    },
  });
}

/** Re-sync store ownership (required by Apple for non-consumables) and verify anything found. */
export async function restoreFullSuite(): Promise<VerifyResult | null> {
  const m = iap();
  if (!m) throw new Error('Restoring needs the App Store or Google Play build of Legend.');
  await m.restorePurchases();
  const purchases = await m.getAvailablePurchases();
  const mine = purchases.filter((p) => p.productId === fullSuiteSku());
  let last: VerifyResult | null = null;
  for (const p of mine) last = await verifyAndFinish(p);
  return last;
}

export interface StoreProduct {
  title: string;
  displayPrice: string;
  description: string;
}

export async function loadProduct(): Promise<StoreProduct | null> {
  const m = iap();
  if (!m) return null;
  await m.initConnection();
  const products = await m.fetchProducts({ skus: [fullSuiteSku()], type: 'in-app' });
  const p = (products ?? [])[0] as { title?: string; displayPrice?: string; description?: string } | undefined;
  return p ? { title: p.title ?? 'Legend Full Suite', displayPrice: p.displayPrice ?? '', description: p.description ?? '' } : null;
}
