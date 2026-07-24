-- Custom agents: user-created named agents that sit on the roster next to the
-- ready-made ones (Maya, Nova, ...). Skills attach to one via config.role
-- holding the agent's id. Ready-made agents stay in code; this table only
-- holds the ones users create themselves.
create table public.team_agents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  emoji text not null default '🤖',
  title text not null default 'Custom agent',
  duties text not null default '',
  created_at timestamptz not null default now()
);

create index team_agents_team_idx on public.team_agents (team_id, created_at);

alter table public.team_agents enable row level security;

create policy "agents read" on public.team_agents
  for select using (public.is_team_member(team_id));
create policy "agents insert" on public.team_agents
  for insert with check (public.is_team_member(team_id));
create policy "agents update" on public.team_agents
  for update using (public.is_team_member(team_id));
create policy "agents delete" on public.team_agents
  for delete using (public.is_team_member(team_id));
