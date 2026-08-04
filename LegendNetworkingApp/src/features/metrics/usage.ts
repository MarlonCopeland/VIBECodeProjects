// src/features/metrics/usage.ts
// Lightweight usage telemetry against our OWN backend (no third-party SDK):
// one `record_app_open` RPC per cold start, which appends a usage_events row
// and bumps profiles.last_seen_at / app_opens. Sign-up date and last login
// are already tracked natively by Supabase auth (auth.users.created_at /
// last_sign_in_at). Metrics must never break the app: every failure is
// swallowed, and the local/demo backend is a silent no-op.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { isSupabaseConfigured } from '../../config/env';
import { getSupabase } from '../../backend/supabase/client';

let recordedThisLaunch = false;

/** Call when the user is authenticated; logs at most once per app launch. */
export async function recordAppOpenOnce(): Promise<void> {
  if (recordedThisLaunch || !isSupabaseConfigured) return;
  recordedThisLaunch = true;
  try {
    await getSupabase().rpc('record_app_open', {
      p_platform: Platform.OS,
      p_app_version: Constants.expoConfig?.version ?? 'unknown',
    });
  } catch {
    /* telemetry is best-effort only */
  }
}
