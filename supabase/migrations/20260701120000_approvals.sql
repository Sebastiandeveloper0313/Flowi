-- ============================================================
-- Flowy — approvals
-- High-stakes actions an agent (or the chat) wants to take — sending an
-- email, creating a calendar event, anything that reaches the outside world —
-- wait here for a human "yes" before they run. Nothing acts behind your back.
--
-- The row stores the exact tool + arguments so approval can execute the very
-- action that was proposed, unchanged.
-- ============================================================
create table public.approvals (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete set null,     -- agent that asked (null = from chat)
  run_id      uuid references public.task_runs (id) on delete set null, -- run that asked
  created_by  uuid references auth.users (id),
  source      text not null default 'agent' check (source in ('agent', 'chat')),
  agent_title text,                                    -- denormalized label for display
  tool_slug   text not null,                           -- e.g. 'GMAIL_SEND_EMAIL'
  tool_args   jsonb not null default '{}'::jsonb,      -- exact arguments to execute on approval
  title       text not null,                           -- "Send email to pearl@acme.com"
  detail      text,                                    -- subject / short preview
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'executed', 'failed')),
  result      text,                                    -- execution output or error message
  decided_by  uuid references auth.users (id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Fast path for the pending queue + badge count.
create index approvals_team_pending_idx
  on public.approvals (team_id, created_at desc)
  where status = 'pending';
create index approvals_team_idx on public.approvals (team_id, created_at desc);

create trigger approvals_updated_at
  before update on public.approvals
  for each row execute function public.set_updated_at();

alter table public.approvals enable row level security;

-- Team members can see their team's approvals and create them (chat runs as the
-- user). Decisions (approve/reject) and execution happen server-side via the
-- approvals edge function using the service role, so there is no update policy.
create policy "approvals read" on public.approvals for select
  using (public.is_team_member(team_id));
create policy "approvals insert" on public.approvals for insert
  with check (public.is_team_member(team_id));
