-- =============================================================================
-- Legend — Full Suite purchase + desktop download delivery
--
-- Flow (see supabase/functions/README.md):
--   1. The phone buys the one-time "Full Suite" product through the App Store
--      or Google Play (expo-iap). The purchase is bound to the Legend account
--      (iOS appAccountToken / Android obfuscatedAccountId = auth user id).
--   2. The app hands the store token to the `verify-purchase` Edge Function,
--      which re-checks it with Apple/Google server-to-server and writes a row
--      in `purchases` with the SERVICE ROLE. Clients can read their own rows
--      but never write them, so ownership can't be forged.
--   3. On the first verified purchase the function creates a `download_grants`
--      token and emails a link (Resend) to the account's address.
--   4. The link hits `desktop-download`, which checks the grant + purchase are
--      still good and redirects to a 5-minute signed URL for the newest
--      installer in the private `desktop-releases` bucket.
--   5. Refunds/revocations (`store-notifications`) flip the purchase status;
--      links and the desktop sign-in gate (`has_full_suite()`) stop working.
--
-- Nothing here touches contact data — the zero-knowledge boundary holds.
-- =============================================================================

create table if not exists public.purchases (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  product               text not null check (product in ('full_suite')),
  platform              text not null check (platform in ('ios', 'android', 'grant')),
  -- iOS: originalTransactionId; Android: orderId; grant: a manual/test grant id.
  store_transaction_id  text not null,
  store_product_id      text not null,
  -- Android needs the token again for refund checks; never readable by clients
  -- (see the column-limited select grant below).
  purchase_token        text,
  environment           text not null default 'production' check (environment in ('production', 'sandbox', 'test')),
  status                text not null default 'active' check (status in ('active', 'refunded', 'revoked')),
  purchased_at          timestamptz not null default now(),
  revoked_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (platform, store_transaction_id)
);

create index if not exists purchases_user_idx on public.purchases (user_id);

alter table public.purchases enable row level security;

drop policy if exists "purchases_select_own" on public.purchases;
create policy "purchases_select_own"
  on public.purchases for select
  using (auth.uid() = user_id);
-- No insert/update/delete policies: only the service role (Edge Functions)
-- writes purchases.

revoke select on public.purchases from anon, authenticated;
grant select (id, user_id, product, platform, environment, status, purchased_at, revoked_at, created_at)
  on public.purchases to authenticated;

drop trigger if exists purchases_touch_updated_at on public.purchases;
create trigger purchases_touch_updated_at
  before update on public.purchases
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- download_grants — the secret in the emailed link. Server-only table.
-- ---------------------------------------------------------------------------
create table if not exists public.download_grants (
  token           text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  user_id         uuid not null references auth.users (id) on delete cascade,
  purchase_id     uuid not null references public.purchases (id) on delete cascade,
  revoked         boolean not null default false,
  last_emailed_at timestamptz,
  emailed_to      text,
  download_count  integer not null default 0,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (purchase_id)
);

alter table public.download_grants enable row level security;
-- No policies at all: invisible to clients.

-- ---------------------------------------------------------------------------
-- desktop_releases — which installer is current per OS. Server-only.
-- Populated by LegendDesktop/scripts/publish-release.mjs.
-- ---------------------------------------------------------------------------
create table if not exists public.desktop_releases (
  id            uuid primary key default gen_random_uuid(),
  version       text not null,
  os            text not null check (os in ('windows', 'mac', 'linux')),
  storage_path  text not null,
  file_name     text not null,
  size_bytes    bigint,
  published_at  timestamptz not null default now(),
  unique (version, os)
);

alter table public.desktop_releases enable row level security;

-- ---------------------------------------------------------------------------
-- has_full_suite() — the desktop sign-in gate and the phone's "owned" check.
-- ---------------------------------------------------------------------------
create or replace function public.has_full_suite()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.purchases
    where user_id = auth.uid()
      and product = 'full_suite'
      and status  = 'active'
  );
$$;

revoke all on function public.has_full_suite() from public;
grant execute on function public.has_full_suite() to authenticated;

-- ---------------------------------------------------------------------------
-- Private bucket for installers. No storage policies: only the service role
-- (desktop-download → signed URL; publish-release script) touches it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('desktop-releases', 'desktop-releases', false)
on conflict (id) do nothing;
