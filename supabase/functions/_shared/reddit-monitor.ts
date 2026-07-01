// Reddit lead-monitor pipeline. Three context-driven stages:
//  1. SELECT: derive buyer-intent search phrases + subreddits from the business
//     context (the words real buyers type), unless the user pinned their own.
//  2. FILTER: judge which posts are genuine leads for this company's ICP.
//  3. DRAFT:  write a helpful, on-brand reply that never pitches a competitor.
// All three compose from the shared operator persona + quality bar + context block.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { connectedToolkits, redditSearch } from "./composio.ts";
import {
  companyName,
  contextBlock,
  operatorPersona,
  QUALITY_STANDARDS,
  type WorkspaceContext,
} from "./marketing.ts";
import type { RedditPost } from "./reddit.ts";
import type { TaskRow } from "./runner.ts";

const MODEL = "claude-opus-4-8";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";

interface MonitorConfig {
  keywords?: string[];
  subreddits?: string[];
  keywords_source?: "user" | "derived";
  derived_sig?: string;
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

/** Stable, cheap signature of the business context, to re-derive only when it changes. */
function contextSig(ws: WorkspaceContext | null): string {
  const s = JSON.stringify(ws?.business_context ?? {}) + "|" + (ws?.name ?? "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return "";
  const res = await fetch(ANTHROPIC, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");
}

function extractJson<T>(text: string, open: "[" | "{"): T | null {
  const close = open === "[" ? "]" : "}";
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * STAGE 1 - derive the actual words real buyers type when they have the problem
 * this company solves (not the brand's own themes), plus subreddits they post in.
 */
async function deriveQueries(
  ws: WorkspaceContext | null,
  seeds: string[],
): Promise<{ keywords: string[]; subreddits: string[] }> {
  const system =
    "You plan a Reddit search strategy for a lead-finding agent working inside this company." +
    contextBlock(ws) +
    "\n\nGive the exact phrases real potential BUYERS type on Reddit when they have the problem this company solves: " +
    'their words, not the brand\'s marketing terms. Think complaints, "looking for", "alternative to", "how do I", ' +
    '"recommend a tool for", direct comparisons, and the pain itself stated plainly. ' +
    "Avoid this company's own brand or product names, and avoid broad one-word terms that return noise. " +
    "Also name the subreddits where these buyers actually post.";
  const user =
    (seeds.length
      ? `Optional seed terms the user mentioned (incorporate if useful): ${seeds.join(", ")}.\n\n`
      : "") +
    'Return ONLY JSON, no prose: {"keywords": ["6-10 buyer-intent search phrases"], "subreddits": ["4-8 subreddit names, no r/ prefix"]}';

  const text = await callClaude(system, user, 1024);
  const parsed = extractJson<{ keywords?: unknown; subreddits?: unknown }>(text, "{");
  const clean = (v: unknown, max: number) =>
    Array.isArray(v)
      ? [...new Set(v.map((x) => String(x).trim().replace(/^r\//i, "")).filter(Boolean))].slice(
          0,
          max,
        )
      : [];
  return { keywords: clean(parsed?.keywords, 10), subreddits: clean(parsed?.subreddits, 8) };
}

/** STAGES 2+3 - score each post as an ICP-fit lead and draft an on-brand reply. */
async function scoreAndDraft(
  posts: RedditPost[],
  ws: WorkspaceContext | null,
  minRel: number,
): Promise<Judged[]> {
  const system =
    operatorPersona(ws) +
    "\n\nYou are scanning Reddit for genuine sales leads for this company and drafting replies.\n" +
    "A real lead is someone who has the problem this company solves and shows intent to fix it: asking for a " +
    "recommendation, comparing options, frustrated with their current tool, or plainly describing the pain. " +
    "Score mostly on that, the PROBLEM and their INTENT, not on whether they perfectly match the ideal customer " +
    `profile. Treat ${companyName(ws)}'s ICP as a bonus signal, not a gate: someone with a clear, relevant problem ` +
    "and real intent is still a good lead even if you cannot tell they match the ICP exactly, so do not reject them " +
    "just because they look like a small business or a solo founder rather than the ideal profile. Still be honest: " +
    "off-topic posts, people offering a solution, and idle chatter are NOT leads.\n" +
    `Score each post 0-100 (problem + intent, plus a bump for ICP fit) and score ${minRel} or higher whenever they ` +
    "genuinely have a relevant problem and some intent.\n" +
    `For any post scoring ${minRel}+, write the reply as a real person leaving a helpful comment: lead with the genuinely ` +
    "useful answer, and bring up this company's product only if it truly fits the conversation (often it should not appear at all).\n\n" +
    QUALITY_STANDARDS +
    contextBlock(ws);

  const list = posts
    .map(
      (p) => `[${p.external_id}] r/${p.subreddit} - ${p.title}\n${p.snippet || "(no body text)"}`,
    )
    .join("\n\n");
  const user =
    `Posts:\n${list}\n\n` +
    "Return ONLY a JSON array, one object per post, no prose: " +
    '[{"external_id":"t3_...","is_lead":true|false,"relevance":0-100,"reason":"one short line",' +
    '"draft_reply":"the reply, or empty string if not a lead"}]';

  const text = await callClaude(system, user, 6000);
  const arr = extractJson<Partial<Judged>[]>(text, "[") ?? [];
  return arr
    .filter((r): r is Judged => typeof r?.external_id === "string")
    .map((r) => ({
      external_id: r.external_id,
      is_lead: !!r.is_lead,
      relevance: Math.max(0, Math.min(100, Number(r.relevance) || 0)),
      reason: String(r.reason ?? "").slice(0, 280),
      draft_reply: String(r.draft_reply ?? ""),
    }));
}

/**
 * Resolve which keywords/subreddits to search. User-pinned terms always win.
 * Otherwise derive from the business context, and persist the result back onto
 * the agent's config (so it shows in "Watching" and is editable). Re-derives
 * only when the context changes, so steady-state runs cost no extra model call.
 */
async function resolveQueries(
  admin: SupabaseClient,
  task: TaskRow,
  ws: WorkspaceContext | null,
  cfg: MonitorConfig,
): Promise<{ keywords: string[]; subreddits: string[] }> {
  const pinned = cfg.keywords_source === "user" && (cfg.keywords?.length ?? 0) > 0;
  if (pinned) {
    return {
      keywords: (cfg.keywords ?? []).map(String),
      subreddits: (cfg.subreddits ?? []).map(String),
    };
  }

  const sig = contextSig(ws);
  const haveFresh = (cfg.keywords?.length ?? 0) > 0 && cfg.derived_sig === sig;
  if (haveFresh) {
    return {
      keywords: (cfg.keywords ?? []).map(String),
      subreddits: (cfg.subreddits ?? []).map(String),
    };
  }

  const derived = await deriveQueries(ws, (cfg.keywords ?? []).map(String));
  if (derived.keywords.length) {
    await admin
      .from("tasks")
      .update({
        config: {
          ...cfg,
          keywords: derived.keywords,
          subreddits: derived.subreddits,
          keywords_source: "derived",
          derived_sig: sig,
        },
      })
      .eq("id", task.id);
  }
  return derived;
}

/** Run a reddit_monitor agent once. Returns a run summary; persists new leads. */
export async function runRedditMonitor(
  admin: SupabaseClient,
  task: TaskRow,
  ws: WorkspaceContext | null,
): Promise<{ summary: string; output: string }> {
  const connected = await connectedToolkits(task.team_id).catch(() => [] as string[]);
  if (!connected.includes("reddit")) {
    return {
      summary: "Reddit isn't connected yet",
      output:
        "This agent needs your Reddit account connected. Open Integrations and connect Reddit, " +
        "then run it again.",
    };
  }

  const cfg = (task.config ?? {}) as MonitorConfig;
  // resolveQueries also derives + persists subreddits (shown in "Watching");
  // the Composio search itself is Reddit-wide, so only keywords drive it here.
  const { keywords } = await resolveQueries(admin, task, ws, cfg);
  if (!keywords.length) {
    return {
      summary: "No keywords to search",
      output:
        "This agent could not derive search terms. Connect your website in onboarding so it knows " +
        "who to look for, or add keywords on the agent.",
    };
  }

  const minRel = cfg.min_relevance ?? 55;
  const maxLeads = cfg.max_leads ?? 10;

  // 1. gather candidate posts. Composio search is Reddit-wide, so we search each
  // buyer-intent keyword globally; the derived subreddits still steer scoring.
  // Two passes per keyword, "relevance" (the best matches, at any age) and "new"
  // (the freshest), so niche phrases still surface plenty to score. All searches
  // run in parallel so the extra breadth doesn't slow the run.
  const queries: { q: string; sort: "relevance" | "new" }[] = [];
  for (const q of keywords.slice(0, 10)) {
    for (const sort of ["relevance", "new"] as const) queries.push({ q, sort });
  }
  const results = await Promise.allSettled(
    queries.map(({ q, sort }) => redditSearch(task.team_id, q, { sort, limit: 40 })),
  );
  const seen = new Set<string>();
  const candidates: RedditPost[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue; // a bad/slow query shouldn't kill the run
    for (const p of r.value) {
      if (!seen.has(p.external_id)) {
        seen.add(p.external_id);
        candidates.push(p);
      }
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
  const fresh = candidates.filter((c) => !have.has(c.external_id)).slice(0, 40);
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
