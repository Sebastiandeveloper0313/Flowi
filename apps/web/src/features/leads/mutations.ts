import { supabase } from "@/integrations/supabase/client";

import type { LeadStatus } from "./queries";

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
