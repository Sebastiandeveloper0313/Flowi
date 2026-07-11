-- Learn the user's voice across ALL content, not just Reddit replies.
--
-- reply_samples was a flat pool of {before, after, at} edits, captured only from
-- Reddit reply posts and applied only to Reddit reply drafting. We now also
-- capture edits the user makes on the Approvals page (LinkedIn, Facebook, email,
-- Reddit) and apply the learned voice to every content kind. Tagging each sample
-- with the content kind lets generation prefer same-format examples (a LinkedIn
-- edit teaches LinkedIn) while still sharing the overall voice as a fallback.
--
-- Adds an optional p_kind arg; the existing 3-arg callers keep working (kind is
-- null). Cap raised to 20 so several kinds can coexist without evicting each
-- other after a burst of one kind.
drop function if exists public.record_reply_edit(uuid, text, text);

create or replace function public.record_reply_edit(
  p_team_id uuid,
  p_before text,
  p_after text,
  p_kind text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v jsonb;
begin
  select coalesce(reply_samples, '[]'::jsonb) into v from public.teams where id = p_team_id;
  v := v || jsonb_build_object('before', p_before, 'after', p_after, 'kind', p_kind, 'at', now());
  if jsonb_array_length(v) > 20 then
    v := (
      select jsonb_agg(elem order by ord)
      from jsonb_array_elements(v) with ordinality as t(elem, ord)
      where ord > jsonb_array_length(v) - 20
    );
  end if;
  update public.teams set reply_samples = v where id = p_team_id;
end;
$$;
