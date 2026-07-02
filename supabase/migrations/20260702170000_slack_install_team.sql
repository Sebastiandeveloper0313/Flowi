-- Record which Flowy team initiated a Slack install (passed through the OAuth
-- state param), so the Integrations page can show Slack as connected for that
-- team. Purely informational for the badge: message identity remains per-user
-- email matching.
alter table public.slack_workspaces
  add column installed_by_team_id uuid references public.teams (id) on delete set null;

create index slack_workspaces_team_idx on public.slack_workspaces (installed_by_team_id);
