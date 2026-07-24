-- A document can belong to one employee (role slug like 'growth', 'social',
-- 'content', 'support') or to the whole team (null). Employees read their own
-- docs plus the shared ones.
alter table public.team_documents add column role text;
