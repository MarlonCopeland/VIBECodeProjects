-- =============================================================================
-- Vendor Finder — Supabase schema, RLS, triggers, and views
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- =============================================================================

-- ---- Enums ------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('user', 'vendor', 'admin');
exception when duplicate_object then null; end $$;

-- ---- profiles (1:1 with auth.users) ----------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  email         text,
  display_name  text,
  role          user_role not null default 'user',
  provider      text default 'email',
  provider_id   text,
  interests     text[] default '{}',
  vendor_id     uuid,
  created_at    timestamptz not null default now()
);

-- ---- vendors ----------------------------------------------------------------
create table if not exists public.vendors (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  type                text not null default 'Other',
  tags                text[] default '{}',
  description         text default '',
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  blocked_user_ids    uuid[] default '{}',
  schedule            jsonb default '[]',
  current_location    jsonb,
  is_open             boolean default false,
  rating              numeric default 0,
  subscription_tier   text not null default 'free',
  subscription_status text not null default 'active',
  -- Stripe linkage (written by webhook; never by the client)
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at          timestamptz not null default now()
);
create index if not exists vendors_owner_idx on public.vendors(owner_id);

-- ---- favorites (follows) ----------------------------------------------------
create table if not exists public.favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vendor_id)
);
create index if not exists favorites_vendor_idx on public.favorites(vendor_id);

-- ---- notifications (typed, quota-limited) ----------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  type          text not null,             -- open_for_business | sale | stock_update
  buckets       text[] not null default '{}', -- quota buckets this send counted against
  title         text not null,
  body          text default '',
  recipient_ids uuid[] default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists notifications_vendor_idx on public.notifications(vendor_id);
create index if not exists notifications_created_idx on public.notifications(created_at);

-- ---- push_tokens ------------------------------------------------------------
create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens(user_id);

-- =============================================================================
-- Weekly usage view: counts this week's sends per quota bucket per vendor.
-- Week starts Monday 00:00 (matches config/tiers.js startOfWeek()).
-- =============================================================================
create or replace view public.vendor_weekly_usage as
select
  n.vendor_id,
  bucket,
  count(*)::int as count
from public.notifications n,
     unnest(n.buckets) as bucket
where n.created_at >= date_trunc('week', now())  -- Postgres week starts Monday
group by n.vendor_id, bucket;

-- =============================================================================
-- Trigger: auto-create a profile row when a new auth user signs up.
-- Reads username/display_name/role from auth metadata (set during signUp).
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  uname text;
  dname text;
  urole user_role;
begin
  uname := coalesce(new.raw_user_meta_data->>'username',
                    split_part(new.email, '@', 1),
                    new.id::text);
  dname := coalesce(new.raw_user_meta_data->>'display_name', uname);
  begin
    urole := coalesce((new.raw_user_meta_data->>'role')::user_role, 'user');
  exception when others then urole := 'user'; end;

  insert into public.profiles (id, username, email, display_name, role, provider)
  values (new.id, uname, new.email, dname, urole,
          coalesce(new.raw_app_meta_data->>'provider', 'email'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles      enable row level security;
alter table public.vendors       enable row level security;
alter table public.favorites     enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens   enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists(select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'admin');
$$;

-- ---- profiles policies ------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (true); -- public directory (display name, role)

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid() or public.is_admin());

-- ---- vendors policies -------------------------------------------------------
drop policy if exists vendors_read on public.vendors;
create policy vendors_read on public.vendors
  for select using (true);

drop policy if exists vendors_insert_owner on public.vendors;
create policy vendors_insert_owner on public.vendors
  for insert with check (owner_id = auth.uid());

-- Owners may update their vendor BUT NOT subscription/stripe columns
-- (those are written only by the service role inside Edge Functions).
drop policy if exists vendors_update_owner on public.vendors;
create policy vendors_update_owner on public.vendors
  for update using (owner_id = auth.uid() or public.is_admin());

drop policy if exists vendors_delete_owner on public.vendors;
create policy vendors_delete_owner on public.vendors
  for delete using (owner_id = auth.uid() or public.is_admin());

-- ---- favorites policies -----------------------------------------------------
drop policy if exists favorites_read on public.favorites;
create policy favorites_read on public.favorites
  for select using (
    user_id = auth.uid()
    or exists(select 1 from public.vendors v
              where v.id = vendor_id and v.owner_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists favorites_insert_self on public.favorites;
create policy favorites_insert_self on public.favorites
  for insert with check (user_id = auth.uid());

drop policy if exists favorites_delete on public.favorites;
create policy favorites_delete on public.favorites
  for delete using (
    user_id = auth.uid()
    or exists(select 1 from public.vendors v
              where v.id = vendor_id and v.owner_id = auth.uid())
    or public.is_admin()
  );

-- ---- notifications policies -------------------------------------------------
-- Recipients and the owning vendor can read. INSERTS are NOT allowed from the
-- client — only the send-notification Edge Function (service role) inserts,
-- after enforcing quota.
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select using (
    auth.uid() = any(recipient_ids)
    or exists(select 1 from public.vendors v
              where v.id = vendor_id and v.owner_id = auth.uid())
    or public.is_admin()
  );

-- ---- push_tokens policies ---------------------------------------------------
drop policy if exists push_tokens_self on public.push_tokens;
create policy push_tokens_self on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- Realtime: expose vendors changes
-- =============================================================================
alter publication supabase_realtime add table public.vendors;
