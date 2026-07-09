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
  task_id: string | null;
  external_id: string;
  subreddit: string | null;
  title: string;
  url: string;
  draft_reply: string | null;
  auto_post_attempts: number | null;
}

/**
 * Record an auto-post as a task_run so it shows up in Activity, just like an
 * on-demand run. Auto mode's whole point is that it acts on its own, so the
 * user needs to see each reply it actually sent (and any that finally failed).
 */
async function logAutoPostRun(
  admin: SupabaseClient,
  lead: QueuedLead,
  ok: boolean,
  errorMsg?: string,
): Promise<void> {
  if (!lead.task_id) return;
  const now = new Date().toISOString();
  const where = lead.subreddit ? ` in r/${lead.subreddit}` : "";
  await admin.from("task_runs").insert({
    task_id: lead.task_id,
    team_id: lead.team_id,
    status: ok ? "succeeded" : "failed",
    started_at: now,
    finished_at: now,
    summary: ok ? `Auto-posted a reply${where}` : `Auto-post failed${where}, moved to review`,
    output: ok
      ? `Replied to "${lead.title}"${where}:\n\n${lead.draft_reply ?? ""}\n\n${lead.url}`
      : (errorMsg ?? "Auto-post failed after repeated tries."),
    ...(ok ? {} : { error: errorMsg ?? "Auto-post failed after repeated tries." }),
  });
}

/** Post any queued auto-replies whose time has come. Returns a small summary. */
export async function dripAutoPosts(
  admin: SupabaseClient,
): Promise<{ posted: number; failed: number; due: number }> {
  const nowIso = new Date().toISOString();
  const { data: due } = await admin
    .from("leads")
    .select(
      "id, team_id, task_id, external_id, subreddit, title, url, draft_reply, auto_post_attempts",
    )
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
      await logAutoPostRun(admin, lead, true);
      posted++;
    } catch (e) {
      const attempts = (lead.auto_post_attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        // repeated failures: stop auto-posting it, leave it for manual review.
        await admin
          .from("leads")
          .update({ status: "new", auto_post_at: null, auto_post_attempts: attempts })
          .eq("id", lead.id);
        await logAutoPostRun(
          admin,
          lead,
          false,
          `Auto-post failed ${attempts} times (${e instanceof Error ? e.message : String(e)}), moved to manual review.`,
        );
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
