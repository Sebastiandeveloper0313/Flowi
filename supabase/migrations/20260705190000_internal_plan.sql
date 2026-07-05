-- "internal" is the unmetered staff plan: passes the paywall, never metered,
-- never billed. Assigned by hand in the database, never by Stripe.
alter table public.teams drop constraint teams_plan_check;
alter table public.teams
  add constraint teams_plan_check check (plan in ('free', 'pro', 'internal'));
