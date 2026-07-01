import { supabase } from "@/integrations/supabase/client";

import type { Lead, LeadStatus } from "./queries";

/** Move a lead through its review lifecycle. Optionally save the edited reply too. */
export async function setLeadStatus(id: string, status: LeadStatus, draftReply?: string) {
  const patch: { status: LeadStatus; draft_reply?: string } = { status };
  if (typeof draftReply === "string") patch.draft_reply = draftReply;
  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) throw error;
}

/** Persist an edited draft reply without changing status. */
export async function updateLeadDraft(id: string, draftReply: string) {
  const { error } = await supabase.from("leads").update({ draft_reply: draftReply }).eq("id", id);
  if (error) throw error;
}

/**
 * Queue a lead's reply to be posted to Reddit. Creates an approval (which the
 * user approves on the Approvals page to actually post) and marks the lead as
 * queued, saving any edits to the reply.
 */
export async function queueLeadReply(lead: Lead, text: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text;
  const { error: aerr } = await supabase.from("approvals").insert({
    team_id: lead.team_id,
    task_id: lead.task_id,
    created_by: user?.id ?? null,
    source: "agent",
    tool_slug: "REDDIT_POST_REDDIT_COMMENT",
    tool_args: { thing_id: lead.external_id, text },
    title: lead.subreddit ? `Post a reply in r/${lead.subreddit}` : "Post a reply on Reddit",
    detail: preview,
    status: "pending",
  });
  if (aerr) throw aerr;
  const { error: lerr } = await supabase
    .from("leads")
    .update({ status: "approved", draft_reply: text })
    .eq("id", lead.id);
  if (lerr) throw lerr;
}
