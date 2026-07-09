-- Per-agent autonomy. Until now Auto/Ask was one workspace-wide switch; this lets
-- each agent override it, so you can auto-post one agent while others still queue
-- for approval. Null means "inherit the workspace setting".
alter table public.tasks add column if not exists autonomy_mode text;

alter table public.tasks drop constraint if exists tasks_autonomy_mode_chk;
alter table public.tasks
  add constraint tasks_autonomy_mode_chk
  check (autonomy_mode is null or autonomy_mode in ('ask', 'auto'));
