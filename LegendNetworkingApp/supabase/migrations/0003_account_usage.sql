-- =============================================================================
-- Legend — account & usage metrics
--
-- What lives where:
--   * Sign-up date            -> auth.users.created_at (native) and
--                                public.profiles.created_at (mirrored at insert)
--   * Last login              -> auth.users.last_sign_in_at (native, set by
--                                GoTrue on every sign-in)
--   * Last app open + count   -> public.profiles.last_seen_at / app_opens
--                                (updated by the record_app_open RPC below)
--   * Per-open event stream   -> public.usage_events (one row per app open,
--                                with platform + app version for cohorting)
--
-- Handy dashboard queries (SQL editor; service role sees across users):
--   select u.email, u.created_at as signed_up, u.last_sign_in_at,
--          p.last_seen_at, p.app_opens
--   from auth.users u join public.profiles p on p.id = u.id
--   order by p.last_seen_at desc nulls last;
--
--   select date_trunc('day', occurred_at) as day, count(*) as opens,
--          count(distinct user_id) as active_users
--   from public.usage_events where event = 'app_open'
--   group by 1 order by 1 desc;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles: rollup columns so "when was this user last here?" is one row read.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_seen_at timestamptz,
  add column if not exists app_opens    integer not null default 0;

-- ---------------------------------------------------------------------------
-- usage_events: append-only event stream, one row per tracked event.
-- Owner-scoped RLS; aggregate/admin reads happen in the dashboard with the
-- service role, never from the client.
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  event       text not null,             -- 'app_open' today; more kinds later
  platform    text,                      -- 'ios' | 'android' | 'web'
  app_version text,
  occurred_at timestamptz not null default now()
);

create index if not exists usage_events_user_time_idx
  on public.usage_events (user_id, occurred_at desc);
create index if not exists usage_events_event_time_idx
  on public.usage_events (event, occurred_at desc);

alter table public.usage_events enable row level security;

drop policy if exists "usage_events_insert_own" on public.usage_events;
create policy "usage_events_insert_own"
  on public.usage_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own"
  on public.usage_events for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- record_app_open: one atomic call from the client on cold start — appends the
-- event AND bumps the profile rollup. SECURITY DEFINER + auth.uid() check
-- keeps it strictly self-scoped.
-- ---------------------------------------------------------------------------
create or replace function public.record_app_open(p_platform text, p_app_version text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.usage_events (user_id, event, platform, app_version)
  values (auth.uid(), 'app_open', p_platform, p_app_version);

  update public.profiles
     set last_seen_at = now(),
         app_opens    = app_opens + 1
   where id = auth.uid();
end;
$$;

revoke all on function public.record_app_open(text, text) from public;
grant execute on function public.record_app_open(text, text) to authenticated;
