-- ============================================================
-- Flowy — conversation history
-- Persists the user's chats with Flowy so they appear in the
-- sidebar and can be reopened. Team-scoped, RLS on.
-- ============================================================

create table public.chats (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  created_by  uuid not null references auth.users (id),
  title       text not null default 'New chat',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index chats_team_idx on public.chats (team_id, updated_at desc);

create trigger chats_updated_at
  before update on public.chats
  for each row execute function public.set_updated_at();

create table public.chat_messages (
  id             uuid primary key default gen_random_uuid(),
  chat_id        uuid not null references public.chats (id) on delete cascade,
  team_id        uuid not null references public.teams (id) on delete cascade, -- denormalized for RLS
  role           text not null check (role in ('user', 'assistant')),
  content        text not null,
  created_agents jsonb not null default '[]'::jsonb, -- [{id,title}] agents spun up in this turn
  created_at     timestamptz not null default now()
);

create index chat_messages_chat_idx on public.chat_messages (chat_id, created_at);

-- ---------- Row Level Security ----------
alter table public.chats         enable row level security;
alter table public.chat_messages enable row level security;

create policy "chats all" on public.chats for all
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

create policy "chat_messages all" on public.chat_messages for all
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
