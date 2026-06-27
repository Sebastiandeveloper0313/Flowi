-- ============================================================
-- Flowy — core schema
-- Teams (multi-tenant), recurring tasks, runs, tool connections.
-- Row Level Security is ON for every table so one team can never
-- read another team's data.
-- ============================================================

-- ---------- helper: keep updated_at fresh ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- profiles  (1:1 with auth.users)
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- teams + membership
-- ============================================================
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create table public.team_members (
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_idx on public.team_members (user_id);

-- ---------- membership helpers (SECURITY DEFINER avoids RLS recursion) ----------
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_admin(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- ============================================================
-- connections  (linked tools: Discord, Stripe, HubSpot, ...)
-- ============================================================
create table public.connections (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  provider    text not null,            -- 'discord' | 'telegram' | 'slack' | 'whatsapp' | 'stripe' | 'hubspot' | 'notion' ...
  label       text,
  config      jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index connections_team_idx on public.connections (team_id);

create trigger connections_updated_at
  before update on public.connections
  for each row execute function public.set_updated_at();

-- ============================================================
-- tasks  (recurring task definitions — the heart of the product)
-- ============================================================
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams (id) on delete cascade,
  created_by    uuid not null references auth.users (id),
  title         text not null,
  instructions  text not null,                 -- plain-English brief
  channel       text not null default 'dashboard', -- where the result is delivered
  schedule_cron text,                            -- e.g. '0 12 * * *' (daily at noon); null = run once
  timezone      text not null default 'UTC',
  status        text not null default 'active' check (status in ('active', 'paused', 'draft')),
  last_run_at   timestamptz,
  next_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index tasks_team_idx on public.tasks (team_id);
create index tasks_next_run_idx on public.tasks (next_run_at) where status = 'active';

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ============================================================
-- task_runs  (one row per execution)
-- ============================================================
create table public.task_runs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  team_id     uuid not null references public.teams (id) on delete cascade, -- denormalized for RLS
  status      text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  summary     text,
  output      text,
  output_url  text,
  error       text,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);

create index task_runs_task_idx on public.task_runs (task_id, created_at desc);

-- ============================================================
-- new-user bootstrap: create a profile + a personal team
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_team_id uuid;
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.teams (name, created_by)
  values (coalesce(new.raw_user_meta_data ->> 'full_name', 'My team'), new.id)
  returning id into new_team_id;

  insert into public.team_members (team_id, user_id, role)
  values (new_team_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles     enable row level security;
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.connections  enable row level security;
alter table public.tasks        enable row level security;
alter table public.task_runs    enable row level security;

-- profiles: you can see/edit your own
create policy "own profile read"   on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid());

-- teams: members can read; any signed-in user can create; admins can update
create policy "team read"   on public.teams for select using (public.is_team_member(id));
create policy "team create" on public.teams for insert with check (created_by = auth.uid());
create policy "team update" on public.teams for update using (public.is_team_admin(id));

-- team_members: members can see their team's roster; admins manage it
create policy "members read"   on public.team_members for select using (public.is_team_member(team_id));
create policy "members manage" on public.team_members for all
  using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));

-- connections: full access for team members
create policy "connections all" on public.connections for all
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- tasks: full access for team members
create policy "tasks all" on public.tasks for all
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- task_runs: team members can read; writes happen server-side (service role bypasses RLS)
create policy "runs read" on public.task_runs for select using (public.is_team_member(team_id));
