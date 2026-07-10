// Reddit post drafts: an agent writes ONE community post (title + body); the app
// (on the user's click) or auto mode publishes it to one or more subreddits.
// Generation and posting are separate so the user can edit and pick subs, and so
// we can record a result per subreddit. Same content can go to several subs.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { executeComposioTool } from "./composio.ts";

export interface ParsedPost {
  title: string;
  body: string;
  subreddits: string[];
}

const SUB_LINE = /^[ \t]*(?:\*\*|#+[ \t]*)?[ \t]*subreddits?[ \t]*:?[ \t]*\*{0,2}[ \t]*(.+)$/im;
const TITLE_LINE = /^[ \t]*(?:\*\*|#+[ \t]*)?[ \t]*title[ \t]*:?[ \t]*\*{0,2}[ \t]*(.+?)[ \t]*$/im;

/** Pull subreddits + title + body out of the model's structured post output. */
export function parsePostDraft(output: string): ParsedPost {
  let text = output.trim();
  let subreddits: string[] = [];
  let title = "";

  // "Subreddits: a, b, c" header line (remove it from the body).
  const subM = text.match(SUB_LINE);
  if (subM && subM.index !== undefined) {
    subreddits = subM[1]
      .replace(/\*\*/g, "")
      .split(/[,;]+/)
      .map((s) =>
        s
          .trim()
          .replace(/^\/?r\//i, "")
          .trim(),
      )
      .filter(Boolean)
      .slice(0, 8);
    text = (text.slice(0, subM.index) + text.slice(subM.index + subM[0].length)).trim();
  }

  // "Title: ..." header line (remove it too); the rest is the body.
  const titleM = text.match(TITLE_LINE);
  if (titleM && titleM.index !== undefined) {
    title = titleM[1].replace(/\*\*/g, "").trim();
    text = (text.slice(0, titleM.index) + text.slice(titleM.index + titleM[0].length)).trim();
  } else {
    // No explicit title line: first real line is the title.
    const first = (text.split("\n").find((l) => l.trim()) ?? "Untitled")
      .replace(/[*#>]/g, "")
      .trim();
    title = first;
    text = text.slice(text.indexOf(first) + first.length).trim();
  }

  return { title: title.slice(0, 300), body: text || title, subreddits };
}

export interface SubResult {
  subreddit: string;
  status: "queued" | "posted" | "failed";
  url?: string;
  error?: string;
  at: string; // when it's scheduled (queued) or when it posted (posted/failed)
}

// Auto mode staggers the chosen subreddits instead of bursting them: the first
// goes out after a delay (a cancel window), the rest are spaced apart, so it
// never looks like a spam blast and the user can pull any before it fires.
const QUEUE_FIRST_DELAY_MIN = 60;
const QUEUE_GAP_MIN = 45;

/** Best-effort permalink out of a Composio create-post response. */
function extractUrl(result: unknown): string | undefined {
  try {
    const s = typeof result === "string" ? result : JSON.stringify(result);
    const direct = s.match(/https?:\/\/(?:www\.)?reddit\.com\/[^\s"'\\]+/);
    if (direct) return direct[0];
    const permalink = s.match(/"permalink"\s*:\s*"([^"]+)"/);
    if (permalink) return `https://www.reddit.com${permalink[1]}`;
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Submit one self-post to Reddit for this team via Composio. */
export async function publishRedditPost(
  teamId: string,
  subreddit: string,
  title: string,
  body: string,
): Promise<SubResult> {
  const clean = subreddit.replace(/^r\//i, "").trim();
  const at = new Date().toISOString();
  try {
    const result = await executeComposioTool(teamId, "REDDIT_CREATE_REDDIT_POST", {
      subreddit: clean,
      title: title.slice(0, 300),
      text: body,
      kind: "self",
    });
    return { subreddit: clean, status: "posted", url: extractUrl(result), at };
  } catch (e) {
    return {
      subreddit: clean,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
      at,
    };
  }
}

/**
 * Create a draft row from a run's parsed output for the given target subreddits
 * (the caller resolves whether those are the model's picks or the user's fixed
 * list). Returns the row id, or null.
 */
export async function createPostDraft(
  admin: SupabaseClient,
  task: { id: string; team_id: string },
  parsed: ParsedPost,
  subreddits: string[],
): Promise<string | null> {
  const { data, error } = await admin
    .from("post_drafts")
    .insert({
      team_id: task.team_id,
      task_id: task.id,
      title: parsed.title,
      body: parsed.body,
      subreddits: [
        ...new Set(subreddits.map((s) => s.replace(/^r\//i, "").trim()).filter(Boolean)),
      ],
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
}

/**
 * Publish a draft to the given subs, recording a result per sub and setting the
 * draft's status. Merges with any prior results so re-posting to more subs later
 * keeps the earlier ones. Honors the (possibly edited) title/body passed in.
 */
export async function publishDraft(
  admin: SupabaseClient,
  draftId: string,
  teamId: string,
  subs: string[],
  title: string,
  body: string,
): Promise<{ posted: number; failed: number; results: SubResult[] }> {
  const results: SubResult[] = [];
  for (const s of subs) {
    results.push(await publishRedditPost(teamId, s, title, body));
  }
  const posted = results.filter((r) => r.status === "posted").length;

  const { data: existing } = await admin
    .from("post_drafts")
    .select("posts")
    .eq("id", draftId)
    .maybeSingle();
  const prior = Array.isArray(existing?.posts) ? (existing.posts as SubResult[]) : [];
  const bySub = new Map<string, SubResult>();
  for (const r of prior) bySub.set(r.subreddit, r);
  for (const r of results) bySub.set(r.subreddit, r);
  const merged = [...bySub.values()];

  // If some subs are still queued (e.g. posting one now while others wait), keep
  // the draft 'queued' with the next due time, so the drip still fires the rest.
  const stillQueued = merged.filter((r) => r.status === "queued");
  const nextAt =
    stillQueued
      .map((r) => r.at)
      .filter(Boolean)
      .sort()[0] ?? null;
  await admin
    .from("post_drafts")
    .update({
      posts: merged,
      title,
      body,
      scheduled_at: nextAt,
      status: stillQueued.length
        ? "queued"
        : merged.some((r) => r.status === "posted")
          ? "posted"
          : "draft",
    })
    .eq("id", draftId);

  return { posted, failed: results.length - posted, results };
}

/**
 * Queue a draft's chosen subs to auto-post, staggered over the next hours, so
 * the user has a window to cancel or edit before any go out. Sets status
 * 'queued' and scheduled_at to the first due time. Returns how many were queued.
 */
export async function queueDraft(
  admin: SupabaseClient,
  draftId: string,
  subs: string[],
): Promise<number> {
  const clean = [...new Set(subs.map((s) => s.replace(/^r\//i, "").trim()).filter(Boolean))];
  if (!clean.length) return 0;
  let t = Date.now() + QUEUE_FIRST_DELAY_MIN * 60_000;
  const entries: SubResult[] = clean.map((subreddit, i) => {
    // Stagger each subsequent post by the base gap +0-80% jitter.
    if (i > 0) t += Math.round(QUEUE_GAP_MIN * 60_000 * (1 + Math.random() * 0.8));
    return { subreddit, status: "queued", at: new Date(t).toISOString() };
  });
  await admin
    .from("post_drafts")
    .update({ posts: entries, status: "queued", scheduled_at: entries[0].at })
    .eq("id", draftId);
  return entries.length;
}

/**
 * Publish any queued sub-posts whose time has come, one per team per tick (so a
 * team never bursts even after downtime). Drains one due sub-post per draft and
 * reschedules the draft to its next pending sub, or marks it posted when done.
 */
export async function dripQueuedPosts(
  admin: SupabaseClient,
): Promise<{ posted: number; failed: number; due: number }> {
  const nowMs = Date.now();
  const { data: due } = await admin
    .from("post_drafts")
    .select("id, team_id, title, body, posts")
    .eq("status", "queued")
    .lte("scheduled_at", new Date(nowMs).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(25);

  const rows = (due ?? []) as {
    id: string;
    team_id: string;
    title: string;
    body: string;
    posts: unknown;
  }[];
  let posted = 0;
  let failed = 0;
  const usedTeams = new Set<string>();

  for (const d of rows) {
    if (usedTeams.has(d.team_id)) continue; // one per team per tick
    const entries = Array.isArray(d.posts) ? (d.posts as SubResult[]) : [];
    const idx = entries.findIndex(
      (e) => e.status === "queued" && e.at && new Date(e.at).getTime() <= nowMs,
    );
    if (idx < 0) continue;
    usedTeams.add(d.team_id);

    entries[idx] = await publishRedditPost(d.team_id, entries[idx].subreddit, d.title, d.body);
    if (entries[idx].status === "posted") posted++;
    else failed++;

    const remaining = entries.filter((e) => e.status === "queued");
    const next = remaining
      .map((e) => e.at)
      .filter(Boolean)
      .sort()[0];
    await admin
      .from("post_drafts")
      .update({
        posts: entries,
        scheduled_at: remaining.length ? next : null,
        status: remaining.length
          ? "queued"
          : entries.some((e) => e.status === "posted")
            ? "posted"
            : "draft",
      })
      .eq("id", d.id);
  }

  return { posted, failed, due: rows.length };
}
