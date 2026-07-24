-- The Brain's document shelf: text the user uploads (pitch decks, FAQs,
-- product sheets) that every employee grounds its work in. Content is stored
-- as extracted plain text, capped in the app; prompts trim further.
create table public.team_documents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  content text not null default '',
  created_at timestamptz not null default now()
);

create index team_documents_team_idx on public.team_documents (team_id, created_at desc);

alter table public.team_documents enable row level security;

create policy "docs read" on public.team_documents
  for select using (public.is_team_member(team_id));
create policy "docs insert" on public.team_documents
  for insert with check (public.is_team_member(team_id));
create policy "docs delete" on public.team_documents
  for delete using (public.is_team_member(team_id));
