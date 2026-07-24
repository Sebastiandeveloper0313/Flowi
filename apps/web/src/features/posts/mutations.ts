import { supabase } from "@/integrations/supabase/client";

import type { SubPostResult } from "./queries";

/** Save edits to a draft (title/body/candidate subreddits) without publishing. */
export async function updatePostDraft(
  id: string,
  patch: { title?: string; body?: string; subreddits?: string[] },
) {
  const { error } = await supabase.from("post_drafts").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setPostDraftStatus(id: string, status: "draft" | "dismissed") {
  const { error } = await supabase.from("post_drafts").update({ status }).eq("id", id);
  if (error) throw error;
}

/**
 * Pull a queued draft out of the auto-post queue before it fires: drop the still
 * pending subreddits, keep any already posted, and move it back to a plain draft
 * (or Posted if some already went out) so nothing else goes out on its own.
 */
export async function cancelQueuedDraft(id: string, results: SubPostResult[]) {
  const kept = results.filter((r) => r.status !== "queued");
  const { error } = await supabase
    .from("post_drafts")
    .update({
      posts: kept,
      scheduled_at: null,
      status: kept.some((r) => r.status === "posted") ? "posted" : "draft",
    })
    .eq("id", id);
  if (error) throw error;
}

const MANUAL_GAP_MIN = 20; // default spacing between manually scheduled posts

/**
 * Stagger a set of subreddits into queued entries so they never post at the same
 * time. Keeps any already posted/failed results; the first goes out after
 * firstDelayMin, the rest are spaced by gapMin (+/-20% jitter).
 */
function staggerQueue(
  subs: string[],
  prior: SubPostResult[],
  firstDelayMin: number,
  gapMin: number,
): SubPostResult[] {
  const kept = prior.filter((r) => r.status !== "queued");
  const keptSubs = new Set(kept.map((r) => r.subreddit));
  const targets = [
    ...new Set(subs.map((s) => s.replace(/^r\//i, "").trim()).filter(Boolean)),
  ].filter((s) => !keptSubs.has(s));
  let t = Date.now() + firstDelayMin * 60_000;
  const gapMs = gapMin * 60_000;
  const queued: SubPostResult[] = targets.map((subreddit, i) => {
    if (i > 0) t += Math.round(gapMs * (0.8 + Math.random() * 0.4));
    return { subreddit, status: "queued", at: new Date(t).toISOString() };
  });
  return [...kept, ...queued];
}

/**
 * Queue the selected subreddits to post spaced out (not all at once). Writes the
 * staggered schedule straight to the draft; the scheduler's drip posts them.
 */
export async function schedulePostDraft(input: {
  draftId: string;
  subreddits: string[];
  title: string;
  body: string;
  firstDelayMin?: number;
  gapMin?: number;
}) {
  const { data: cur } = await supabase
    .from("post_drafts")
    .select("posts")
    .eq("id", input.draftId)
    .maybeSingle();
  const prior = Array.isArray(cur?.posts) ? (cur.posts as unknown as SubPostResult[]) : [];
  const merged = staggerQueue(
    input.subreddits,
    prior,
    input.firstDelayMin ?? 0,
    input.gapMin ?? MANUAL_GAP_MIN,
  );
  const queued = merged.filter((r) => r.status === "queued");
  const nextAt =
    queued
      .map((r) => r.at)
      .filter(Boolean)
      .sort((a, b) => (a ?? "").localeCompare(b ?? ""))[0] ?? null;
  const { error } = await supabase
    .from("post_drafts")
    .update({
      posts: merged,
      title: input.title,
      body: input.body,
      status: queued.length
        ? "queued"
        : merged.some((r) => r.status === "posted")
          ? "posted"
          : "draft",
      scheduled_at: nextAt,
    })
    .eq("id", input.draftId);
  if (error) throw error;
}

/** Change when one queued sub-post goes out. */
export async function reschedulePost(input: {
  draftId: string;
  subreddit: string;
  at: string;
  results: SubPostResult[];
}) {
  const next = input.results.map((r) =>
    r.subreddit === input.subreddit && r.status === "queued" ? { ...r, at: input.at } : r,
  );
  const nextAt =
    next
      .filter((r) => r.status === "queued")
      .map((r) => r.at)
      .filter(Boolean)
      .sort((a, b) => (a ?? "").localeCompare(b ?? ""))[0] ?? null;
  const { error } = await supabase
    .from("post_drafts")
    .update({ posts: next, scheduled_at: nextAt })
    .eq("id", input.draftId);
  if (error) throw error;
}

/**
 * Move a whole draft to a new time. Used by the calendar for drafts that post
 * to a single place (LinkedIn, Facebook), where there is one time, not one per
 * subreddit.
 */
export async function rescheduleDraft(id: string, at: string) {
  const { error } = await supabase.from("post_drafts").update({ scheduled_at: at }).eq("id", id);
  if (error) throw error;
}

export interface PublishResult {
  posted: number;
  failed: number;
  results: SubPostResult[];
}

/**
 * Publish a draft to the selected subreddits. Saves the (possibly edited)
 * title/body first so the draft and what goes out agree, then posts through the
 * publish-post function, which records a result per subreddit. Throws if nothing
 * posted, surfacing the first subreddit's error.
 */
export async function publishPostDraft(input: {
  draftId: string;
  subreddits: string[];
  title: string;
  body: string;
}): Promise<PublishResult> {
  await updatePostDraft(input.draftId, { title: input.title, body: input.body });
  const { data, error } = await supabase.functions.invoke("publish-post", {
    body: {
      draft_id: input.draftId,
      subreddits: input.subreddits,
      title: input.title,
      body: input.body,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const result = data?.result as PublishResult | undefined;
  if (!result) throw new Error("Publishing failed. Try again.");
  if (result.posted === 0) {
    const firstError = result.results.find((r) => r.status === "failed")?.error;
    throw new Error(firstError || "Reddit didn't accept the post. Try again.");
  }
  return result;
}
