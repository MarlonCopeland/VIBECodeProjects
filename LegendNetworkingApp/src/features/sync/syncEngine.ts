// src/features/sync/syncEngine.ts
// Legend Sync engine (TASKS.md Phase 8.3): reconciles the on-device SQLite
// vault with the encrypted `sync_changes` relay in Supabase.
//
//   syncNow() = PULL (fetch batches after our cursor, decrypt, HLC-merge,
//               advance the local clock past everything seen)
//             then PUSH (collect rows newer than the push cursor, encrypt
//               in chunks, append to the relay).
//
// The relay only ever sees ciphertext (vaultCrypto) and the paywall is
// enforced by RLS server-side — an expired subscription surfaces here as a
// push/pull error, not as trusted client logic. Realtime INSERT events on
// the relay trigger a debounced pull so two online devices converge live.
// Everything is best-effort and re-entrant: local data is authoritative and
// the app never waits on this module.

import { getSupabase } from '../../backend/supabase/client';
import { isSupabaseConfigured } from '../../config/env';
import { expoSqlDriver } from '../../backend/local/sql/expoSqlDriver';
import { getMeta, migrate, setMeta } from '../../backend/local/sql/schema';
import { getDeviceId, observeHlc } from '../../lib/hlc';
import { getVaultKey, ensureVaultKey, vaultKeyId } from './vaultKey';
import { openPayload, sealPayload } from './vaultCrypto';
import {
  applySnapshots,
  collectChanges,
  maxHlcOf,
  type RowSnapshot,
} from './snapshots';
import { setSyncWriteHandler } from './syncScheduler';

const PUSH_CURSOR_KEY = 'sync.pushCursor';
const PULL_CURSOR_KEY = 'sync.pullCursor';
const LAST_SYNCED_KEY = 'sync.lastSyncedAt';
const PUSH_CHUNK_ROWS = 200;
const PULL_PAGE = 100;
const WRITE_DEBOUNCE_MS = 4000;

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
}

interface RelayRow {
  id: number;
  device_id: string;
  hlc: string;
  payload: string;
  key_id: string | null;
}

let state: SyncState = { status: 'idle', lastSyncedAt: null, error: null };
const stateListeners = new Set<(s: SyncState) => void>();
const appliedListeners = new Set<() => void>();

let started = false;
let syncing = false;
let runAgain = false;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let channel: { unsubscribe: () => void } | null = null;

function emitState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const cb of stateListeners) cb(state);
}

export function getSyncState(): SyncState {
  return state;
}

export function onSyncState(cb: (s: SyncState) => void): () => void {
  stateListeners.add(cb);
  return () => stateListeners.delete(cb);
}

/** Fires after remote changes were applied locally (refresh your UI state). */
export function onSyncApplied(cb: () => void): () => void {
  appliedListeners.add(cb);
  return () => appliedListeners.delete(cb);
}

async function driverReady() {
  await migrate(expoSqlDriver);
  return expoSqlDriver;
}

async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('Not signed in.');
  return uid;
}

async function pull(key: Uint8Array, myKeyId: string, deviceId: string): Promise<void> {
  const supabase = getSupabase();
  const d = await driverReady();
  let cursor = Number((await getMeta(d, PULL_CURSOR_KEY)) ?? '0');
  let appliedAny = false;

  for (;;) {
    const { data, error } = await supabase
      .from('sync_changes')
      .select('id, device_id, hlc, payload, key_id')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(PULL_PAGE);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RelayRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (row.device_id !== deviceId) {
        if (row.key_id && row.key_id !== myKeyId) {
          // Do NOT advance past undecryptable data — the user must install
          // the right recovery key first, then this row applies cleanly.
          throw new Error(
            'Changes from your other device use a different key. Import that device’s recovery key in Settings → Legend Sync.',
          );
        }
        let snapshots: RowSnapshot[];
        try {
          snapshots = openPayload<RowSnapshot[]>(key, row.payload);
        } catch {
          throw new Error(
            'Could not decrypt synced changes — make sure every device uses the same recovery key.',
          );
        }
        const applied = await applySnapshots(d, snapshots);
        if (applied > 0) appliedAny = true;
        await observeHlc(row.hlc);
      }
      cursor = row.id;
      await setMeta(d, PULL_CURSOR_KEY, String(cursor));
    }
    if (rows.length < PULL_PAGE) break;
  }

  if (appliedAny) for (const cb of appliedListeners) cb();
}

async function push(key: Uint8Array, myKeyId: string, deviceId: string): Promise<void> {
  const supabase = getSupabase();
  const d = await driverReady();
  const uid = await currentUserId();
  const cursor = (await getMeta(d, PUSH_CURSOR_KEY)) ?? '';

  // First push ever (empty cursor) uploads EVERYTHING, including rows written
  // before sync existed; afterwards each device only pushes its own writes.
  const changes = await collectChanges(d, cursor, cursor === '' ? null : deviceId);
  if (changes.length === 0) return;

  for (let i = 0; i < changes.length; i += PUSH_CHUNK_ROWS) {
    const chunk = changes.slice(i, i + PUSH_CHUNK_ROWS);
    const payload = await sealPayload(key, chunk);
    const { error } = await supabase.from('sync_changes').insert({
      owner_id: uid,
      device_id: deviceId,
      hlc: maxHlcOf(chunk),
      payload,
      key_id: myKeyId,
    });
    if (error) {
      // RLS refuses inserts without an active sync subscription.
      if (error.code === '42501') {
        throw new Error('Sync needs an active subscription (Settings → Legend Sync).');
      }
      throw new Error(error.message);
    }
    await setMeta(d, PUSH_CURSOR_KEY, maxHlcOf(chunk));
  }
}

/** Run a full pull+push cycle. Re-entrant: overlapping calls queue one rerun. */
export async function syncNow(): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (syncing) {
    runAgain = true;
    return;
  }
  syncing = true;
  emitState({ status: 'syncing', error: null });
  try {
    const key = (await getVaultKey()) ?? (await ensureVaultKey());
    const myKeyId = await vaultKeyId(key);
    const deviceId = await getDeviceId();
    await pull(key, myKeyId, deviceId);
    await push(key, myKeyId, deviceId);
    const now = new Date().toISOString();
    await setMeta(await driverReady(), LAST_SYNCED_KEY, now);
    emitState({ status: 'idle', lastSyncedAt: now, error: null });
  } catch (e) {
    emitState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  } finally {
    syncing = false;
    if (runAgain) {
      runAgain = false;
      void syncNow();
    }
  }
}

function scheduleSync(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void syncNow();
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Start background sync: initial cycle, debounced push after local writes,
 * and a Realtime subscription so another device's push triggers a pull.
 */
export async function startSync(): Promise<void> {
  if (started || !isSupabaseConfigured) return;
  started = true;
  setSyncWriteHandler(scheduleSync);

  const d = await driverReady();
  state = { ...state, lastSyncedAt: await getMeta(d, LAST_SYNCED_KEY) };

  try {
    const uid = await currentUserId();
    const deviceId = await getDeviceId();
    const supabase = getSupabase();
    channel = supabase
      .channel(`sync-changes-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sync_changes', filter: `owner_id=eq.${uid}` },
        (payload: { new?: { device_id?: string } }) => {
          if (payload.new?.device_id !== deviceId) scheduleSync();
        },
      )
      .subscribe();
  } catch {
    // Realtime is an optimization; foreground/write-triggered syncs still run.
  }

  void syncNow();
}

export function stopSync(): void {
  if (!started) return;
  started = false;
  setSyncWriteHandler(null);
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  channel?.unsubscribe();
  channel = null;
}
