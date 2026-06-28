// Reddit lead-monitor pipeline: search Reddit for the agent's keywords, drop
// anything we've already captured, have Claude judge which posts are genuine
// leads and draft a helpful on-brand reply, then persist them for review.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { contextBlock, QUALITY_STANDARDS, type WorkspaceContext } from "./marketing.ts";
import { redditConnected, type RedditPost, searchReddit } from "./reddit.ts";
import type { TaskRow } from "./runner.ts";

interface MonitorConfig {
  keywords?: string[];
  subreddits?: string[];
  min_relevance?: number;
  max_leads?: number;
  time?: "day" | "week" | "month" | "year";
}

interface Judged {
  external_id: string;
  is_lead: boolean;
  relevance: number;
  reason: string;
  draft_reply: string;
}

/** Pull the largest JSON array out of a model response. */
function extractJsonArray(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
}

/** Ask Claude to score each post as a lead and draft a reply for the strong ones. */
async function scoreAndDraft(
  posts: RedditPost[],
  ws: WorkspaceContext | null,
  minRel: number,
): Promise<Judged[]> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return [];

  const system =
    "You are Flowy, a senior marketing operator hunting for genuine sales leads on Reddit for this company." +
    contextBlock(ws) +
    "\n\n" +
    QUALITY_STANDARDS +
    "\n\nA real lead is someone describing a problem this company solves, asking for a recommendation, " +
    "comparing options, or frustrated with an alternative. Be strict: most posts are NOT leads. " +
    "Score 0-100 by how well the author fits the company's ICP and buying intent. " +
    `For any post scoring ${minRel} or higher, write a reply that helps first and mentions the product only ` +
    "naturally and honestly (often not at all). Reddit hates ads: no pitch, no marketing voice, no links unless " +
    "genuinely useful. Sound like a real, knowledgeable person leaving a helpful comment.";

  const list = posts
    .map(
      (p) => `[${p.external_id}] r/${p.subreddit} — ${p.title}\n${p.snippet || "(no body text)"}`,
    )
    .join("\n\n");
  const user =
    `Posts:\n${list}\n\n` +
    "Return ONLY a JSON array, one object per post, no prose: " +
    '[{"external_id":"t3_...","is_lead":true|false,"relevance":0-100,"reason":"one short line",' +
    '"draft_reply":"the reply, or empty string if not a lead"}]';

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");

  return extractJsonArray(text)
    .map((r) => r as Partial<Judged>)
    .filter((r): r is Judged => typeof r?.external_id === "string")
    .map((r) => ({
      external_id: r.external_id,
      is_lead: !!r.is_lead,
      relevance: Math.max(0, Math.min(100, Number(r.relevance) || 0)),
      reason: String(r.reason ?? "").slice(0, 280),
      draft_reply: String(r.draft_reply ?? ""),
    }));
}

/** Run a reddit_monitor agent once. Returns a run summary; persists new leads. */
export async function runRedditMonitor(
  admin: SupabaseClient,
  task: TaskRow,
  ws: WorkspaceContext | null,
): Promise<{ summary: string; output: string }> {
  if (!redditConnected()) {
    return {
      summary: "Reddit isn't connected yet",
      output:
        "This agent needs Reddit connected. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to the " +
        "function secrets (one free Reddit app), then run it again.",
    };
  }

  const cfg = (task.config ?? {}) as MonitorConfig;
  let keywords = (cfg.keywords ?? []).map((k) => String(k).trim()).filter(Boolean);
  if (!keywords.length) {
    const kw = (ws?.business_context as { keywords?: unknown })?.keywords;
    if (Array.isArray(kw)) keywords = kw.map(String).slice(0, 4);
  }
  if (!keywords.length) {
    return {
      summary: "No keywords configured",
      output: "Add keywords to this agent so it knows what to watch for on Reddit.",
    };
  }

  const subreddits = (cfg.subreddits ?? []).map((s) => String(s).trim()).filter(Boolean);
  const minRel = cfg.min_relevance ?? 60;
  const maxLeads = cfg.max_leads ?? 10;
  const time = cfg.time ?? "week";

  // 1. gather candidate posts across keyword × subreddit queries
  const seen = new Set<string>();
  const candidates: RedditPost[] = [];
  const queries = subreddits.length
    ? keywords.flatMap((q) => subreddits.map((sub) => ({ q, sub })))
    : keywords.map((q) => ({ q, sub: undefined as string | undefined }));
  for (const { q, sub } of queries.slice(0, 8)) {
    try {
      const posts = await searchReddit(q, { subreddit: sub, time, limit: 15, sort: "new" });
      for (const p of posts) {
        if (!seen.has(p.external_id)) {
          seen.add(p.external_id);
          candidates.push(p);
        }
      }
    } catch {
      // one bad query shouldn't kill the run
    }
  }
  if (!candidates.length) {
    return {
      summary: "No matching Reddit posts found",
      output: `Searched: ${keywords.join(", ")}.`,
    };
  }

  // 2. drop posts already captured as leads
  const ids = candidates.map((c) => c.external_id);
  const { data: existing } = await admin
    .from("leads")
    .select("external_id")
    .eq("team_id", task.team_id)
    .eq("source", "reddit")
    .in("external_id", ids);
  const have = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id));
  const fresh = candidates.filter((c) => !have.has(c.external_id)).slice(0, 25);
  if (!fresh.length) {
    return {
      summary: "No new leads (all already seen)",
      output: "Every matching post was already captured in a previous run.",
    };
  }

  // 3. score + draft
  const judged = await scoreAndDraft(fresh, ws, minRel);
  const byId = new Map(fresh.map((p) => [p.external_id, p]));
  const leads = judged
    .filter((j) => j.is_lead && j.relevance >= minRel && byId.has(j.external_id))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxLeads);

  // 4. persist
  if (leads.length) {
    const rows = leads.map((l) => {
      const p = byId.get(l.external_id)!;
      return {
        team_id: task.team_id,
        task_id: task.id,
        source: "reddit",
        external_id: p.external_id,
        url: p.url,
        title: p.title,
        snippet: p.snippet,
        author: p.author,
        subreddit: p.subreddit,
        score: p.score,
        relevance: l.relevance,
        reason: l.reason,
        draft_reply: l.draft_reply,
        status: "new",
      };
    });
    await admin.from("leads").upsert(rows, {
      onConflict: "team_id,source,external_id",
      ignoreDuplicates: true,
    });
  }

  const summary = `Found ${leads.length} new Reddit lead${leads.length === 1 ? "" : "s"}`;
  const output = leads.length
    ? leads
        .map((l) => {
          const p = byId.get(l.external_id)!;
          return `- r/${p.subreddit} (${l.relevance}) ${p.title}\n  ${p.url}`;
        })
        .join("\n")
    : `Checked ${fresh.length} recent posts; none were a strong enough lead this run.`;
  return { summary, output };
}
