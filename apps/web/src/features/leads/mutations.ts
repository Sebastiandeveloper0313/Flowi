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
 * Post a lead's reply to Reddit now. The user is looking at the reply and
 * clicked post, so their click IS the approval, no detour to the Approvals
 * page. We still record an approval row for the audit trail, then execute it
 * immediately through the same vetted path the Approvals page uses. Leaves the
 * lead "new" on failure so it can be retried. (The Approvals page stays the
 * review queue for actions an agent proposes on its own.)
 */
export async function postLeadReplyNow(lead: Lead, text: string): Promise<{ edited: boolean }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // If they rewrote the draft before posting, that's a signal of how they like
  // their replies. Captured after a successful post so we only learn from real
  // sends. Best effort: never let learning break posting.
  const original = (lead.draft_reply ?? "").trim();
  const edited = original.length > 0 && text.trim() !== original;
  const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text;
  const { data: approval, error: aerr } = await supabase
    .from("approvals")
    .insert({
      team_id: lead.team_id,
      task_id: lead.task_id,
      created_by: user?.id ?? null,
      source: "agent",
      tool_slug: "REDDIT_POST_REDDIT_COMMENT",
      tool_args: { thing_id: lead.external_id, text },
      title: lead.subreddit ? `Post a reply in r/${lead.subreddit}` : "Post a reply on Reddit",
      detail: preview,
      status: "pending",
    })
    .select("id")
    .single();
  if (aerr || !approval) throw aerr ?? new Error("Could not prepare the reply.");

  const { data, error } = await supabase.functions.invoke("approvals", {
    body: { approval_id: approval.id, decision: "approve" },
  });
  if (error) throw error;
  if (data?.status !== "executed") {
    throw new Error(data?.error || "Reddit didn't accept the reply. Try again.");
  }

  const { error: lerr } = await supabase
    .from("leads")
    .update({ status: "posted", draft_reply: text })
    .eq("id", lead.id);
  if (lerr) throw lerr;

  if (edited) {
    await supabase
      .rpc("record_reply_edit", { p_team_id: lead.team_id, p_before: original, p_after: text })
      .then(
        () => {},
        () => {}, // best effort
      );
  }
  return { edited };
}
