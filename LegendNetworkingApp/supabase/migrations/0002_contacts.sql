-- =============================================================================
-- Legend — contact graph schema
-- Contacts, the interaction log (grading source of truth), and circles of
-- influence. Everything is owner-scoped with RLS, mirroring 0001_init.sql.
--
-- Apply with the Supabase CLI:  supabase db push
-- or paste into the SQL editor after 0001_init.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  first_name   text not null default '',
  last_name    text not null default '',
  nickname     text,
  company      text,
  title        text,
  phones       jsonb not null default '[]'::jsonb,   -- [{label, number}]
  emails       jsonb not null default '[]'::jsonb,   -- [{label, address}]
  avatar_url   text,
  where_met    jsonb,                                -- {placeName, city?, note?}
  premises     jsonb not null default '[]'::jsonb,   -- [{id, kind, label, tags[]}]
  notes        text,
  favorite     boolean not null default false,
  source       text not null default 'manual' check (source in ('manual', 'device', 'csv')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists contacts_owner_idx on public.contacts (owner_id);

alter table public.contacts enable row level security;

drop policy if exists "contacts_manage_own" on public.contacts;
create policy "contacts_manage_own"
  on public.contacts for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- interactions: the log grades are computed from. Never updated in place —
-- only inserted and (rarely) deleted.
-- ---------------------------------------------------------------------------
create table if not exists public.interactions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  contact_id   uuid not null references public.contacts (id) on delete cascade,
  kind         text not null check (kind in ('call', 'text', 'email', 'visit', 'premise', 'note')),
  occurred_at  timestamptz not null default now(),
  note         text,
  premise_id   text,
  created_at   timestamptz not null default now()
);

create index if not exists interactions_owner_idx on public.interactions (owner_id);
create index if not exists interactions_contact_idx on public.interactions (contact_id);

alter table public.interactions enable row level security;

drop policy if exists "interactions_manage_own" on public.interactions;
create policy "interactions_manage_own"
  on public.interactions for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- circles: saved premise queries + pin/exclude overrides.
-- ---------------------------------------------------------------------------
create table if not exists public.circles (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users (id) on delete cascade,
  name                  text not null,
  query                 jsonb not null default '{"kinds":[],"tags":[]}'::jsonb,
  pinned_contact_ids    jsonb not null default '[]'::jsonb,
  excluded_contact_ids  jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists circles_owner_idx on public.circles (owner_id);

alter table public.circles enable row level security;

drop policy if exists "circles_manage_own" on public.circles;
create policy "circles_manage_own"
  on public.circles for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop trigger if exists circles_touch_updated_at on public.circles;
create trigger circles_touch_updated_at
  before update on public.circles
  for each row execute function public.touch_updated_at();
