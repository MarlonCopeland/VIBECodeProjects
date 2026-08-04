-- =============================================================================
-- Legend — sync entitlements + oplog groundwork (SYNC_DESIGN.md, Phase 8.3)
--
-- Sync is an OPT-IN PAID UPGRADE. Design notes:
--   * The relay is an append-only `sync_changes` oplog table — NOT blob
--     storage. Each row is one change (table, row id, HLC stamp, patch).
--     Phase 8.4 encrypts the patch client-side so this table only ever
--     stores ciphertext (zero-knowledge relay, Obsidian Sync's model).
--   * `subscriptions` records who bought sync (monthly or yearly). During
--     beta the client may self-grant a 'beta' subscription (free, honest UI
--     says so). Real billing (StoreKit subscription on iOS — required for
--     digital goods — with server-side receipt validation writing rows here
--     via the service role) replaces that before launch; the RLS below only
--     ever lets a client write 'beta' rows, so paid rows can't be forged.
--   * RLS on sync_changes requires an ACTIVE sync subscription — the paywall
--     is enforced server-side, not just hidden in the UI.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  product            text not null default 'sync' check (product in ('sync')),
  plan               text not null check (plan in ('monthly', 'yearly')),
  status             text not null default 'active' check (status in ('active', 'canceled', 'expired')),
  source             text not null default 'beta' check (source in ('beta', 'storekit', 'stripe')),
  started_at         timestamptz not null default now(),
  current_period_end timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, product)
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Clients can only ever create/modify BETA subscriptions for themselves.
-- Paid rows ('storekit'/'stripe') are written exclusively by the service role
-- (receipt-validation webhook), which bypasses RLS.
drop policy if exists "subscriptions_insert_own_beta" on public.subscriptions;
create policy "subscriptions_insert_own_beta"
  on public.subscriptions for insert
  with check (auth.uid() = user_id and source = 'beta');

drop policy if exists "subscriptions_update_own_beta" on public.subscriptions;
create policy "subscriptions_update_own_beta"
  on public.subscriptions for update
  using (auth.uid() = user_id and source = 'beta')
  with check (auth.uid() = user_id and source = 'beta');

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- True when the caller currently owns sync. Used by sync_changes RLS.
create or replace function public.has_active_sync()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = auth.uid()
      and product = 'sync'
      and status  = 'active'
      and (current_period_end is null or current_period_end > now())
  );
$$;

revoke all on function public.has_active_sync() from public;
grant execute on function public.has_active_sync() to authenticated;

-- ---------------------------------------------------------------------------
-- sync_changes: the shared oplog (SYNC_DESIGN.md layer 3). Append-only from
-- the client; `patch` holds the field-level change today and ciphertext once
-- Phase 8.4 (E2E encryption) lands. Server-assigned `id` is the pull cursor.
-- ---------------------------------------------------------------------------
create table if not exists public.sync_changes (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  device_id  text not null,
  tbl        text not null,   -- e.g. 'contacts', 'premises', 'interactions'
  row_id     text not null,
  hlc        text not null,   -- Hybrid Logical Clock stamp (src/lib/hlc.ts)
  patch      jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists sync_changes_owner_cursor_idx
  on public.sync_changes (owner_id, id);

alter table public.sync_changes enable row level security;

-- The paywall, enforced at the database: reads and writes both require an
-- active sync subscription in addition to ownership.
drop policy if exists "sync_changes_insert_own_subscribed" on public.sync_changes;
create policy "sync_changes_insert_own_subscribed"
  on public.sync_changes for insert
  with check (auth.uid() = owner_id and public.has_active_sync());

drop policy if exists "sync_changes_select_own_subscribed" on public.sync_changes;
create policy "sync_changes_select_own_subscribed"
  on public.sync_changes for select
  using (auth.uid() = owner_id and public.has_active_sync());

-- Live push between online devices (Phase 8.3 uses Realtime on this table).
do $$
begin
  alter publication supabase_realtime add table public.sync_changes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
