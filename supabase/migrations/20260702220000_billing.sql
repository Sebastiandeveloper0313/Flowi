-- ============================================================
-- Flowy — billing
-- Plan state lives on the team, kept in sync by Stripe webhooks. Clients can
-- read their plan (it's on teams, already member-readable) but only the
-- webhook (service role) writes billing fields.
-- ============================================================
alter table public.teams
  add column plan text not null default 'free' check (plan in ('free', 'pro')),
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column subscription_status text;

create index teams_stripe_customer_idx on public.teams (stripe_customer_id);

-- Members can see their own team's usage (for the Billing tab's usage meter).
-- Writes remain service-role only (no insert/update policies).
create policy "usage read" on public.usage_events for select
  using (public.is_team_member(team_id));
