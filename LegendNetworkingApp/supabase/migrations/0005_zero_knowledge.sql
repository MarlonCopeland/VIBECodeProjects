-- =============================================================================
-- Legend — zero-knowledge redesign
--
-- DECISION (2026-08-05): Supabase never stores the contact graph, in any
-- form the operator can read. The per-user SQLite vault on the device is the
-- ONLY plaintext home of contacts/relationships (SYNC_DESIGN.md). Postgres
-- keeps exactly three jobs:
--   1. Accounts      — auth.users, profiles, push_tokens
--   2. Metrics       — usage_events + profile rollups (0003)
--   3. Sync product  — subscriptions (entitlements) + two CIPHERTEXT-ONLY
--                      stores: the `sync_changes` oplog relay and the
--                      `vaults` storage bucket for encrypted vault snapshots.
--
-- The plaintext mirror tables from 0002 (contacts / interactions / circles)
-- are dropped. They were never reachable by the app in production (the anon
-- key was never configured before this redesign), so nothing is lost.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Drop the plaintext contact-graph mirror.
-- ---------------------------------------------------------------------------
drop table if exists public.interactions cascade;
drop table if exists public.circles cascade;
drop table if exists public.contacts cascade;

-- ---------------------------------------------------------------------------
-- sync_changes: reduce to an opaque encrypted envelope. Which table/row a
-- change touches is itself relationship metadata, so `tbl`/`row_id`/`patch`
-- move INSIDE the encrypted payload. What remains in plaintext is only what
-- routing needs: whose log it is, which device wrote it, the HLC stamp for
-- ordering, and the server cursor (id).
--
-- `payload` = base64(nonce || AEAD-ciphertext) of the JSON change record,
-- encrypted client-side with a key derived on-device (Phase 8.4). The table
-- is empty today (engine not yet built), so the NOT NULL add is safe.
-- ---------------------------------------------------------------------------
alter table public.sync_changes
  drop column if exists tbl,
  drop column if exists row_id,
  drop column if exists patch;

alter table public.sync_changes
  add column if not exists payload text not null,
  add column if not exists key_id text;   -- lets clients rotate vault keys

-- ---------------------------------------------------------------------------
-- vaults: PRIVATE storage bucket for encrypted SQLite vault snapshots
-- (passphrase/device-key encrypted blobs — Phase 8.5 full-vault backup and
-- fast new-device bootstrap without replaying the whole oplog). No public
-- read; owner-folder scoped; requires the paid sync subscription, same as
-- the oplog.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('vaults', 'vaults', false, 268435456)  -- 256 MB per object
on conflict (id) do nothing;

drop policy if exists "vaults_select_own" on storage.objects;
create policy "vaults_select_own"
  on storage.objects for select
  using (
    bucket_id = 'vaults'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_sync()
  );

drop policy if exists "vaults_insert_own" on storage.objects;
create policy "vaults_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'vaults'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_sync()
  );

drop policy if exists "vaults_update_own" on storage.objects;
create policy "vaults_update_own"
  on storage.objects for update
  using (
    bucket_id = 'vaults'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_sync()
  );

drop policy if exists "vaults_delete_own" on storage.objects;
create policy "vaults_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'vaults'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_sync()
  );
