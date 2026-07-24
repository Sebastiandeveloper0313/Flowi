-- A custom employee can carry a real picture (uploaded to the team-scoped
-- agent-media bucket), not just an emoji. Null falls back to emoji, then to a
-- monogram tile.
alter table public.team_agents add column avatar_url text;
