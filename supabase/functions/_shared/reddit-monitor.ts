// Reddit lead-monitor pipeline. Context-driven, built for daily volume:
//  1. SELECT: derive short buyer-intent search terms + the subreddits buyers
//     post in (their words, not the brand's), unless the user pinned their own.
//  2. GATHER: ingest each subreddit's fresh /new feed AND run keyword search,
//     so the candidate pool is hundreds of posts, not a few dozen.
//  3. TRIAGE: a cheap high-recall first pass (Haiku) drops obvious noise.
//  4. SCORE: judge the survivors for genuine intent + draft an on-brand reply,
//     in parallel batches so volume never truncates a single call.
// All stages compose from the shared operator persona + quality bar + context.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { connectedToolkits, redditSearch, redditSubredditPosts } from "./composio.ts";
import {
  companyName,
  contextBlock,
  operatorPersona,
  QUALITY_STANDARDS,
  type WorkspaceContext,
} from "./marketing.ts";
import type { RedditPost } from "./reddit.ts";
import type { TaskRow } from "./runner.ts";

const MODEL = "claude-opus-4-8"; // scoring + drafting (precision)
const TRIAGE_MODEL = "claude-haiku-4-5-20251001"; // cheap first-pass filter (recall)
const ANTHROPIC = "https://api.anthropic.com/v1/messages";

// Bump to force existing agents to re-derive queries once with an improved
// prompt (e.g. long sentence keywords -> short search terms).
const QUERY_VERSION = "v2";

// Volume + cost bounds per run.
const FEED_SUBS = 12; // subreddits whose /new feed we ingest
const FEED_LIMIT = 100; // posts per subreddit
const SEARCH_TERMS = 8; // keyword searches
const SEARCH_LIMIT = 50; // results per search
const MAX_TRIAGE = 400; // posts sent to the cheap filter
const TRIAGE_BATCH = 60;
const TRIAGE_SKIP = 40; // small pools skip triage and go straight to scoring
const MAX_SCORE = 72; // survivors sent to the expensive scorer
const SCORE_BATCH = 12; // posts per scoring call (parallel)
const SEEN_CAP = 1500; // rolling set of already-considered post ids

interface MonitorConfig {
  keywords?: string[];
  subreddits?: string[];
  keywords_source?: "user" | "derived";
  derived_sig?: string;
  seen_ids?: string[];
  min_relevance?: number;
  max_leads?: number;
  lookback_hours?: number;
}

interface Judged {
  external_id: string;
  is_lead: boolean;
  relevance: number;
  reason: string;
  draft_reply: string;
}

function chunkArr<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

/** Run async tasks with bounded concurrency (protects Reddit's rate limit). */
async function mapPool<R>(
  tasks: Array<() => Promise<R>>,
  limit: number,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try {
        out[idx] = { status: "fulfilled", value: await tasks[idx]() };
      } catch (e) {
        out[idx] = { status: "rejected", reason: e };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

/** Stable, cheap signature of the business context, to re-derive only when it changes. */
function contextSig(ws: WorkspaceContext | null): string {
  const s =
    QUERY_VERSION + "|" + JSON.stringify(ws?.business_context ?? {}) + "|" + (ws?.name ?? "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

async function callClaude(
  system: string,
  user: string,
  maxTokens: number,
  model: string = MODEL,
): Promise<string> {
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
      model,
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
 * STAGE 1 - derive SHORT search terms real buyers type (Reddit search is literal
 * keyword matching, so sentences return junk), plus the subreddits they post in.
 */
async function deriveQueries(
  ws: WorkspaceContext | null,
  seeds: string[],
): Promise<{ keywords: string[]; subreddits: string[] }> {
  const system =
    "You plan a Reddit search strategy for a lead-finding agent working inside this company." +
    contextBlock(ws) +
    "\n\nGive SHORT search terms (2 to 4 words each) that real potential BUYERS type on Reddit when " +
    "they have the problem this company solves: their words, not the brand's marketing terms. Reddit " +
    "search is literal keyword matching, so full sentences return junk; prefer tight noun phrases and " +
    'pain terms (e.g. "marketing agency alternative", "no time for marketing", "reddit lead tool"). ' +
    "Avoid this company's own brand or product names, and avoid broad one-word terms that return noise. " +
    "Then name the subreddits where these buyers actually post: be generous, more relevant subreddits " +
    "means more leads.";
  const user =
    (seeds.length
      ? `Optional seed terms the user mentioned (incorporate if useful): ${seeds.join(", ")}.\n\n`
      : "") +
    'Return ONLY JSON, no prose: {"keywords": ["8-12 short buyer-intent terms"], "subreddits": ["8-14 subreddit names, no r/ prefix"]}';

  const text = await callClaude(system, user, 1024);
  const parsed = extractJson<{ keywords?: unknown; subreddits?: unknown }>(text, "{");
  const clean = (v: unknown, max: number) =>
    Array.isArray(v)
      ? [...new Set(v.map((x) => String(x).trim().replace(/^r\//i, "")).filter(Boolean))].slice(
          0,
          max,
        )
      : [];
  return { keywords: clean(parsed?.keywords, 12), subreddits: clean(parsed?.subreddits, 14) };
}

/**
 * STAGE 3 - cheap high-recall filter. Keeps anything that could plausibly be a
 * real person with a problem or intent, drops obvious noise, so the expensive
 * scorer only sees candidates. Fails OPEN (keeps the batch) on any error or
 * unparseable reply, so a filter hiccup can never zero out a run.
 */
async function triage(posts: RedditPost[], ws: WorkspaceContext | null): Promise<RedditPost[]> {
  if (posts.length <= TRIAGE_SKIP) return posts;
  const batches = chunkArr(posts, TRIAGE_BATCH);
  const kept: RedditPost[] = [];
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const list = batch
          .map(
            (p) =>
              `[${p.external_id}] r/${p.subreddit}: ${p.title}` +
              (p.snippet ? ` - ${p.snippet.slice(0, 140)}` : ""),
          )
          .join("\n");
        const system =
          "You are a fast first-pass filter for a Reddit lead-finding agent. KEEP a post if it could " +
          "plausibly be a real person with a problem, a question, a request for a recommendation, a " +
          "comparison of tools, or a stated need this business could help with. DROP obvious noise: " +
          "memes, news, announcements, self-promotion, giveaways, and off-topic chatter. Be generous: " +
          "when unsure, KEEP. Precision comes later." +
          contextBlock(ws);
        const user =
          `Posts:\n${list}\n\n` +
          'Return ONLY a JSON array of the external_ids to keep, e.g. ["t3_abc","t3_def"]. ' +
          "Use [] only if truly none qualify.";
        const text = await callClaude(system, user, 1500, TRIAGE_MODEL);
        const parsed = extractJson<string[]>(text, "[");
        if (!Array.isArray(parsed)) {
          kept.push(...batch); // unparseable -> fail open
          return;
        }
        const keep = new Set(parsed.map(String));
        kept.push(...batch.filter((p) => keep.has(p.external_id)));
      } catch {
        kept.push(...batch); // error -> fail open
      }
    }),
  );
  return kept;
}

/** STAGE 4 - score each post as an ICP-fit lead and draft an on-brand reply. */
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
 * Otherwise derive from the business context. Returns a config patch to persist
 * (so "Watching" shows the terms) rather than writing here, so the run can fold
 * it into a single write alongside the rolling seen-set. Re-derives only when
 * the context (or the query version) changes.
 */
async function resolveQueries(
  task: TaskRow,
  ws: WorkspaceContext | null,
  cfg: MonitorConfig,
): Promise<{ keywords: string[]; subreddits: string[]; patch: Partial<MonitorConfig> }> {
  const pinned = cfg.keywords_source === "user" && (cfg.keywords?.length ?? 0) > 0;
  if (pinned) {
    return {
      keywords: (cfg.keywords ?? []).map(String),
      subreddits: (cfg.subreddits ?? []).map(String),
      patch: {},
    };
  }

  const sig = contextSig(ws);
  const haveFresh = (cfg.subreddits?.length ?? 0) > 0 && cfg.derived_sig === sig;
  if (haveFresh) {
    return {
      keywords: (cfg.keywords ?? []).map(String),
      subreddits: (cfg.subreddits ?? []).map(String),
      patch: {},
    };
  }

  const derived = await deriveQueries(ws, (cfg.keywords ?? []).map(String));
  if (derived.keywords.length || derived.subreddits.length) {
    return {
      ...derived,
      patch: {
        keywords: derived.keywords,
        subreddits: derived.subreddits,
        keywords_source: "derived",
        derived_sig: sig,
      },
    };
  }
  // derivation failed: keep whatever we had rather than wiping the agent.
  return {
    keywords: (cfg.keywords ?? []).map(String),
    subreddits: (cfg.subreddits ?? []).map(String),
    patch: {},
  };
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
  const { keywords, subreddits, patch } = await resolveQueries(task, ws, cfg);
  if (!keywords.length && !subreddits.length) {
    return {
      summary: "No search terms yet",
      output:
        "This agent could not derive who to look for. Connect your website in onboarding so it knows " +
        "your business, or add keywords and subreddits on the agent.",
    };
  }

  const minRel = cfg.min_relevance ?? 55;
  const maxLeads = cfg.max_leads ?? 20;
  const lookbackHours = cfg.lookback_hours ?? 72;
  const cutoff = Math.floor(Date.now() / 1000) - lookbackHours * 3600;

  const feedSubs = subreddits.slice(0, FEED_SUBS);
  const searchTerms = keywords.slice(0, SEARCH_TERMS);

  // 1. gather: subreddit /new feeds (freshest, highest-signal) + keyword search
  //    (reach beyond the watched subs). All in parallel; a slow/bad query is
  //    skipped rather than killing the run.
  const jobs: Array<() => Promise<RedditPost[]>> = [
    ...feedSubs.map(
      (sub) => () => redditSubredditPosts(task.team_id, sub, { sort: "new", limit: FEED_LIMIT }),
    ),
    ...searchTerms.map(
      (q) => () => redditSearch(task.team_id, q, { sort: "new", limit: SEARCH_LIMIT }),
    ),
  ];
  const results = await mapPool(jobs, 8);
  const seenThisRun = new Set<string>();
  const candidates: RedditPost[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const p of r.value) {
      if (seenThisRun.has(p.external_id)) continue;
      seenThisRun.add(p.external_id);
      candidates.push(p);
    }
  }
  const gathered = candidates.length;
  if (!gathered) {
    return {
      summary: "No Reddit posts found",
      output: `Checked ${feedSubs.length} subreddits and ${searchTerms.length} searches; nothing came back this run.`,
    };
  }

  // 2. keep recent, drop already-seen (rolling) and already-captured leads
  const recent = candidates.filter((p) => !p.created_utc || p.created_utc >= cutoff);
  const prevSeen = new Set((cfg.seen_ids ?? []).map(String));
  const ids = recent.map((p) => p.external_id).slice(0, 1000);
  const { data: existing } = await admin
    .from("leads")
    .select("external_id")
    .eq("team_id", task.team_id)
    .eq("source", "reddit")
    .in("external_id", ids);
  const haveLead = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id));
  const fresh = recent
    .filter((p) => !prevSeen.has(p.external_id) && !haveLead.has(p.external_id))
    .sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));
  const triageInput = fresh.slice(0, MAX_TRIAGE);

  // 3. cheap triage -> plausible leads, then 4. batched precise scoring
  const survivors = triageInput.length ? await triage(triageInput, ws) : [];
  const toScore = survivors.slice(0, MAX_SCORE);
  const batches = chunkArr(toScore, SCORE_BATCH);
  const judgedArrays = await Promise.all(
    batches.map((b) => scoreAndDraft(b, ws, minRel).catch(() => [] as Judged[])),
  );
  const judged = judgedArrays.flat();
  const byId = new Map(toScore.map((p) => [p.external_id, p]));
  const leads = judged
    .filter((j) => j.is_lead && j.relevance >= minRel && byId.has(j.external_id))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxLeads);

  // 5. persist leads
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

  // 6. persist the derived terms + roll the seen-set forward (so tomorrow's run
  //    doesn't re-score today's posts). One write.
  const nextSeen = [...prevSeen, ...triageInput.map((p) => p.external_id)];
  const trimmedSeen = nextSeen.slice(Math.max(0, nextSeen.length - SEEN_CAP));
  await admin
    .from("tasks")
    .update({ config: { ...cfg, ...patch, seen_ids: trimmedSeen } })
    .eq("id", task.id);

  // richer output: on an empty run, show what it scanned and the closest calls,
  // so a zero is explainable instead of a mystery.
  const summary = `Found ${leads.length} new Reddit lead${leads.length === 1 ? "" : "s"}`;
  let output: string;
  if (leads.length) {
    output = leads
      .map((l) => {
        const p = byId.get(l.external_id)!;
        return `- r/${p.subreddit} (${l.relevance}) ${p.title}\n  ${p.url}`;
      })
      .join("\n");
  } else {
    const nearMiss = judged
      .filter((j) => byId.has(j.external_id) && j.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3)
      .map((j) => {
        const p = byId.get(j.external_id)!;
        return `- (${j.relevance}/100) r/${p.subreddit}: ${p.title}`;
      });
    output =
      `Scanned ${gathered} posts from ${feedSubs.length} subreddits and ${searchTerms.length} searches, ` +
      `${toScore.length} looked promising, none cleared the ${minRel}/100 bar this run.` +
      (nearMiss.length ? `\n\nClosest calls:\n${nearMiss.join("\n")}` : "");
  }
  return { summary, output };
}
