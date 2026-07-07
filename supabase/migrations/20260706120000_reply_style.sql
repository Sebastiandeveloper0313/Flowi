-- Reply personalization. Two things the drafter uses so Reddit replies sound
-- like the user and follow their preferences (link usage, tone, length):
--   reply_instructions: what they type up front, "here's how I want replies".
--   reply_samples: a rolling set of the edits they make to drafts, so the
--     drafter learns their voice from how they rewrite things.
-- Team-level, and separate from business_context so a website re-analysis
-- (which overwrites business_context) never wipes it.
alter table public.teams
  add column reply_instructions text,
  add column reply_samples jsonb not null default '[]'::jsonb;

-- Append one (before -> after) edit, newest last, capped at the last 10.
-- SECURITY INVOKER: the UPDATE runs under the existing "team update" RLS
-- (team admins only), so a member can only record edits for their own team,
-- and passing another team's id is a silent no-op.
create or replace function public.record_reply_edit(p_team_id uuid, p_before text, p_after text)
returns void
language plpgsql
security invoker
as $$
declare
  v jsonb;
begin
  select coalesce(reply_samples, '[]'::jsonb) into v from public.teams where id = p_team_id;
  v := v || jsonb_build_object('before', p_before, 'after', p_after, 'at', now());
  if jsonb_array_length(v) > 10 then
    v := (
      select jsonb_agg(elem order by ord)
      from jsonb_array_elements(v) with ordinality as t(elem, ord)
      where ord > jsonb_array_length(v) - 10
    );
  end if;
  update public.teams set reply_samples = v where id = p_team_id;
end;
$$;
