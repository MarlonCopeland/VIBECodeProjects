// src/features/sync/SyncProvider.tsx
// Lifecycle glue for the sync engine: starts it only when everything lines
// up (signed in, Supabase build, sync feature on, per-device toggle on, and
// an active subscription), stops it when anything changes, refreshes the
// contacts state after remote changes apply, and re-syncs on app foreground.
// Mounted inside ContactsProvider (AppProviders) so it can trigger refresh().

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { isSupabaseConfigured } from '../../config/env';
import { isFeatureEnabled } from '../../config/features';
import { useAuth } from '../auth/AuthContext';
import { useAppSettings } from '../settings/AppSettingsContext';
import { useContacts } from '../contacts/ContactsContext';
import {
  getSyncState,
  onSyncApplied,
  onSyncState,
  startSync,
  stopSync,
  syncNow,
  type SyncState,
} from './syncEngine';
import { getSyncSubscription, isSubscriptionActive } from './subscriptionService';

interface SyncContextValue {
  syncState: SyncState;
  /** Entitlement as last checked; null = not yet checked. */
  entitled: boolean | null;
  syncNow: () => Promise<void>;
  /** Re-check the subscription (call after subscribing/canceling). */
  recheckEntitlement: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const { ready, syncEnabled } = useAppSettings();
  const { refresh } = useContacts();
  const [syncState, setSyncState] = useState<SyncState>(getSyncState());
  const [entitled, setEntitled] = useState<boolean | null>(null);

  const eligibleBase =
    isFeatureEnabled('sync') && isSupabaseConfigured && status === 'authenticated' && ready;

  const recheckEntitlement = useCallback(async () => {
    if (!eligibleBase) {
      setEntitled(null);
      return;
    }
    try {
      setEntitled(isSubscriptionActive(await getSyncSubscription()));
    } catch {
      setEntitled(false);
    }
  }, [eligibleBase]);

  // Check the subscription whenever eligibility inputs change.
  useEffect(() => {
    void recheckEntitlement();
  }, [recheckEntitlement]);

  // Mirror engine state into React.
  useEffect(() => onSyncState(setSyncState), []);

  // Remote changes landed in the vault — reload the in-memory contact graph.
  useEffect(() => onSyncApplied(() => void refresh()), [refresh]);

  // Start/stop the engine.
  const shouldRun = eligibleBase && syncEnabled && entitled === true;
  useEffect(() => {
    if (!shouldRun) return;
    void startSync();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncNow();
    });
    return () => {
      sub.remove();
      stopSync();
    };
  }, [shouldRun]);

  return (
    <SyncContext.Provider value={{ syncState, entitled, syncNow, recheckEntitlement }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
