// Drip poster for Reddit auto-mode replies.
//
// Reddit runs QUEUE their auto-posts with staggered times (see reddit-monitor.ts);
// this drains that queue, posting due ones one at a time. It is invoked every
// minute by the scheduler. Two safety rails against bursts:
//   1. staggered auto_post_at (set at queue time) does the real spacing.
//   2. at most ONE post per team per tick here, so even if several fall due at
//      once (e.g. after downtime) they still catch up gradually, never at once.
// A failed post backs off and retries a few times, then drops to manual review.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { executeComposioTool } from "./composio.ts";

const PER_TICK = 25; // due posts scanned per invocation
const MAX_ATTEMPTS = 3; // give up on auto-posting after this many failures
const RETRY_BACKOFF_MIN = 30; // wait this long before retrying a failed post

interface QueuedLead {
  id: string;
  team_id: string;
  external_id: string;
  draft_reply: string | null;
  auto_post_attempts: number | null;
}

/** Post any queued auto-replies whose time has come. Returns a small summary. */
export async function dripAutoPosts(
  admin: SupabaseClient,
): Promise<{ posted: number; failed: number; due: number }> {
  const nowIso = new Date().toISOString();
  const { data: due } = await admin
    .from("leads")
    .select("id, team_id, external_id, draft_reply, auto_post_attempts")
    .eq("status", "queued")
    .lte("auto_post_at", nowIso)
    .order("auto_post_at", { ascending: true })
    .limit(PER_TICK);

  const rows = (due ?? []) as QueuedLead[];
  let posted = 0;
  let failed = 0;
  const usedTeams = new Set<string>();

  for (const lead of rows) {
    if (usedTeams.has(lead.team_id)) continue; // one per team per tick
    usedTeams.add(lead.team_id);

    // no draft to post: shouldn't happen (we only queue with a draft), but be safe
    if (!lead.draft_reply?.trim()) {
      await admin.from("leads").update({ status: "new", auto_post_at: null }).eq("id", lead.id);
      continue;
    }

    try {
      await executeComposioTool(lead.team_id, "REDDIT_POST_REDDIT_COMMENT", {
        thing_id: lead.external_id,
        text: lead.draft_reply,
      });
      await admin.from("leads").update({ status: "posted" }).eq("id", lead.id);
      posted++;
    } catch {
      const attempts = (lead.auto_post_attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        // repeated failures: stop auto-posting it, leave it for manual review.
        await admin
          .from("leads")
          .update({ status: "new", auto_post_at: null, auto_post_attempts: attempts })
          .eq("id", lead.id);
      } else {
        // transient: back off and try again on a later tick.
        const next = new Date(Date.now() + RETRY_BACKOFF_MIN * 60_000).toISOString();
        await admin
          .from("leads")
          .update({ auto_post_at: next, auto_post_attempts: attempts })
          .eq("id", lead.id);
      }
      failed++;
    }
  }

  return { posted, failed, due: rows.length };
}
