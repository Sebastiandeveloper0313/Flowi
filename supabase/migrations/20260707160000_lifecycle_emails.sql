-- Lifecycle email automation: idempotent send log, per-user opt-out, and the
-- candidate queries that drive the scheduled sweep. Emails themselves are sent
-- from edge functions via Resend; this is the data layer that keeps sends
-- once-only and respects unsubscribes.

-- When a subscription actually lapsed (period ended), so win-back can be timed.
alter table public.teams add column if not exists subscription_canceled_at timestamptz;

-- One row per email we actually sent. dedupe_key scopes uniqueness per scenario
-- (user id for onboarding, subscription id for cancel/win-back), so a retrying
-- webhook or an overlapping sweep can never double-send.
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  kind text not null,
  dedupe_key text not null,
  to_email text,
  provider_id text,
  sent_at timestamptz not null default now()
);
create unique index if not exists email_log_kind_dedupe_uidx on public.email_log (kind, dedupe_key);

-- Per-user opt-out of non-essential lifecycle email (win-back, nudges). Pure
-- billing mail (cancel confirmation) is transactional and ignores this.
create table if not exists public.email_optout (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  opted_out_at timestamptz
);
create unique index if not exists email_optout_token_uidx on public.email_optout (token);

-- Locked down: only the service role (edge functions) touches these. No policies
-- means no anon/authenticated access; the service key bypasses RLS.
alter table public.email_log enable row level security;
alter table public.email_optout enable row level security;

-- Users who signed up but never finished onboarding on any product. Bounded to a
-- 2h-7d window: 2h so we don't nag someone mid-signup, 7d so a first deploy
-- doesn't blast every old dormant account. Excludes opt-outs and anyone already
-- nudged.
create or replace function public.email_onboarding_candidates()
returns table (user_id uuid, email text, team_id uuid, full_name text)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.email::text,
    (
      select tm.team_id
      from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where tm.user_id = u.id
      order by t.created_at
      limit 1
    ) as team_id,
    coalesce(p.full_name, '') as full_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.email is not null
    and u.created_at < now() - interval '2 hours'
    and u.created_at > now() - interval '7 days'
    and not exists (
      select 1
      from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where tm.user_id = u.id and t.onboarding_completed = true
    )
    and not exists (
      select 1 from public.email_optout o
      where o.user_id = u.id and o.opted_out_at is not null
    )
    and not exists (
      select 1 from public.email_log l
      where l.user_id = u.id and l.kind = 'onboarding'
    );
$$;

-- Owners whose paid plan lapsed 7-14 days ago and who have not resubscribed. The
-- 7-14d window gives them a beat after losing access and stops a first deploy
-- from win-backing ancient churn. One per team, excludes opt-outs and anyone
-- already sent a win-back for this lapse.
drop function if exists public.email_winback_candidates();
create or replace function public.email_winback_candidates()
returns table (user_id uuid, email text, team_id uuid, subscription_id text, full_name text)
language sql
security definer
set search_path = public
as $$
  select
    owner.user_id,
    u.email::text,
    t.id,
    t.stripe_subscription_id,
    coalesce(p.full_name, '') as full_name
  from public.teams t
  join lateral (
    select tm.user_id
    from public.team_members tm
    where tm.team_id = t.id
    order by (tm.role = 'owner') desc, tm.created_at
    limit 1
  ) owner on true
  join auth.users u on u.id = owner.user_id
  left join public.profiles p on p.id = owner.user_id
  where t.subscription_canceled_at is not null
    and t.subscription_canceled_at < now() - interval '7 days'
    and t.subscription_canceled_at > now() - interval '14 days'
    and coalesce(t.subscription_status, '') = 'canceled'
    and coalesce(t.plan, 'free') <> 'pro'
    and u.email is not null
    and not exists (
      select 1 from public.email_optout o
      where o.user_id = owner.user_id and o.opted_out_at is not null
    )
    and not exists (
      select 1 from public.email_log l
      where l.team_id = t.id and l.kind = 'winback'
    );
$$;
