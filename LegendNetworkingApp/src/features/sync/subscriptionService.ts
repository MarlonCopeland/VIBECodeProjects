// src/features/sync/subscriptionService.ts
// Legend Sync entitlements. Sync is an OPT-IN PAID UPGRADE (monthly, or
// yearly at a discount). During beta the "purchase" is a free self-granted
// row (source='beta') — the subscriptions RLS only lets clients write beta
// rows, so real paid rows can only come from server-side receipt validation
// (StoreKit subscription; iOS requires IAP for digital goods) when billing
// lands. The sync_changes oplog RLS checks this subscription server-side,
// so the paywall isn't just UI.

import { getSupabase } from '../../backend/supabase/client';
import { isSupabaseConfigured } from '../../config/env';

export type SyncPlanId = 'monthly' | 'yearly';

export interface SyncPlan {
  id: SyncPlanId;
  name: string;
  price: string;
  cadence: string;
  note?: string;
}

/** Display pricing (final billing arrives with StoreKit products). */
export const SYNC_PLANS: readonly SyncPlan[] = [
  { id: 'monthly', name: 'Monthly', price: '$2.99', cadence: 'per month' },
  { id: 'yearly', name: 'Yearly', price: '$19.99', cadence: 'per year', note: 'Save 44% vs monthly' },
];

export interface SyncSubscription {
  plan: SyncPlanId;
  status: 'active' | 'canceled' | 'expired';
  source: 'beta' | 'storekit' | 'stripe';
  startedAt: string;
  currentPeriodEnd: string | null;
}

interface SubscriptionRow {
  plan: SyncPlanId;
  status: SyncSubscription['status'];
  source: SyncSubscription['source'];
  started_at: string;
  current_period_end: string | null;
}

function rowToSubscription(row: SubscriptionRow): SyncSubscription {
  return {
    plan: row.plan,
    status: row.status,
    source: row.source,
    startedAt: row.started_at,
    currentPeriodEnd: row.current_period_end,
  };
}

export function isSyncAvailable(): boolean {
  return isSupabaseConfigured;
}

export async function getSyncSubscription(): Promise<SyncSubscription | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, source, started_at, current_period_end')
    .eq('product', 'sync')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToSubscription(data as SubscriptionRow) : null;
}

/** Beta "purchase": free, honest, and limited to source='beta' by RLS. */
export async function subscribeToSyncBeta(plan: SyncPlanId): Promise<SyncSubscription> {
  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userData.user.id,
        product: 'sync',
        plan,
        status: 'active',
        source: 'beta',
        current_period_end: null,
      },
      { onConflict: 'user_id,product' },
    )
    .select('plan, status, source, started_at, current_period_end')
    .single();
  if (error) throw new Error(error.message);
  return rowToSubscription(data as SubscriptionRow);
}

export async function cancelSyncSubscription(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('product', 'sync');
  if (error) throw new Error(error.message);
}

export function isSubscriptionActive(sub: SyncSubscription | null): boolean {
  if (!sub || sub.status !== 'active') return false;
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() < Date.now()) return false;
  return true;
}
