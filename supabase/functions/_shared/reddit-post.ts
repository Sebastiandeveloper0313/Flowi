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
  status: "posted" | "failed";
  url?: string;
  error?: string;
  at: string;
}

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

/** Create a draft row from a run's parsed output. Returns the row id, or null. */
export async function createPostDraft(
  admin: SupabaseClient,
  task: { id: string; team_id: string; config?: Record<string, unknown> | null },
  parsed: ParsedPost,
): Promise<string | null> {
  // Prefer the subreddits the model chose for THIS post; fall back to any the
  // user pinned on the agent's config.
  const configSubs = (task.config as { subreddits?: unknown } | null)?.subreddits;
  const fallback = Array.isArray(configSubs)
    ? configSubs.map((s) => String(s).replace(/^r\//i, "").trim()).filter(Boolean)
    : [];
  const subreddits = parsed.subreddits.length ? parsed.subreddits : fallback;
  const { data, error } = await admin
    .from("post_drafts")
    .insert({
      team_id: task.team_id,
      task_id: task.id,
      title: parsed.title,
      body: parsed.body,
      subreddits,
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

  await admin
    .from("post_drafts")
    .update({
      posts: merged,
      title,
      body,
      status: merged.some((r) => r.status === "posted") ? "posted" : "draft",
    })
    .eq("id", draftId);

  return { posted, failed: results.length - posted, results };
}
