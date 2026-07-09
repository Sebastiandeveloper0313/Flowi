// Sentrive - analyze-website. Turns a company URL (or a manual description) into
// structured business context the marketing operator uses to avoid generic output.
// Uses Claude with the hosted web_fetch/web_search tools (no extra API key).
import { createClient } from "jsr:@supabase/supabase-js@2";

import { resolveTeamId } from "../_shared/team.ts";
import { meter } from "../_shared/usage.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

const SYSTEM = `You are a senior marketing strategist building a brief on a company so an AI marketing operator can produce on-brand, non-generic work for it.

Research the company from the provided website (use the web_fetch and web_search tools to read its pages) or from the description given. Then return ONLY a JSON object - no prose, no markdown fences - with exactly these keys:
{
  "summary": "2-3 sentence plain-English summary of the business",
  "what_they_do": "what the company actually does / sells",
  "product": "the core product or service and its key value props",
  "audience": "who their customers are (ICP), described specifically",
  "voice": "their brand voice and tone in a few words (e.g. 'bold, technical, irreverent')",
  "positioning": "how they're positioned vs alternatives, and their differentiator",
  "keywords": ["5-10", "topical", "keywords", "and", "themes"]
}

Be specific and evidence-based from what you find, never generic filler. If a field is genuinely unknowable, use a best-effort inference and keep it concise. Never use em dashes anywhere in the JSON values; use commas, periods, or parentheses.`;

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");

function normalizeUrl(u: string): string {
  let s = u.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, "");
}

/** Scrape one page to clean markdown via Firecrawl. Empty string on any failure. */
async function scrapeOne(url: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${FIRECRAWL_KEY}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return "";
    const d = await res.json();
    const md = d?.data?.markdown;
    return typeof md === "string" ? md : "";
  } catch {
    return "";
  }
}

/**
 * Scrape the homepage plus a couple of common pages (about, pricing) with
 * Firecrawl, in parallel, and return the combined markdown. Empty if Firecrawl
 * isn't configured or every scrape fails (caller falls back to Claude web_fetch).
 */
async function scrapeSite(rawUrl: string): Promise<string> {
  if (!FIRECRAWL_KEY) return "";
  const base = normalizeUrl(rawUrl);
  const targets = [base, `${base}/about`, `${base}/pricing`];
  const results = await Promise.all(targets.map(scrapeOne));
  const combined = results.filter(Boolean).join("\n\n----\n\n");
  return combined.slice(0, 40_000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { website_url, description, team_id } = await req.json().catch(() => ({}));
    const url = typeof website_url === "string" ? website_url.trim() : "";
    const desc = typeof description === "string" ? description.trim() : "";
    if (!url && !desc) return json({ error: "website_url or description is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const teamId = await resolveTeamId(userClient, team_id);
    if (!teamId) return json({ error: "no team for user" }, 403);

    const usage = await meter(teamId, "analyze_website");
    if (!usage.ok) {
      return json(
        { error: `Daily analysis limit reached (${usage.limit}). Try again tomorrow.` },
        429,
      );
    }

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "AI is not configured on the server." }, 503);

    // Prefer Firecrawl: scrape the site to clean markdown, then extract with a
    // cheaper model. Fall back to Claude's own web_fetch when Firecrawl is off
    // or returns nothing, and use the description directly when there's no URL.
    const scraped = url ? await scrapeSite(url) : "";
    let model: string;
    let userMessage: string;
    let tools: { type: string; name: string; max_uses: number }[] | undefined;
    if (scraped) {
      model = "claude-sonnet-5";
      userMessage = `Build the brief from these scraped pages of the company's website (${url}):\n\n${scraped}`;
      tools = undefined;
    } else if (url) {
      model = "claude-opus-4-8";
      userMessage = `Research and build the brief for this company website: ${url}`;
      tools = [
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
        { type: "web_search_20260209", name: "web_search", max_uses: 3 },
      ];
    } else {
      model = "claude-opus-4-8";
      userMessage = `Build the brief from this description of the business:\n\n${desc}`;
      tools = undefined;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let content: { type: string; text?: string }[] = [];
    try {
      const messages: { role: string; content: unknown }[] = [
        { role: "user", content: userMessage },
      ];
      // web_search/web_fetch run in a server-side container; a paused turn must
      // echo the same container id back on the follow-up request.
      let container: string | undefined;

      for (let i = 0; i < 5; i++) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 2048,
            system: SYSTEM,
            ...(tools ? { tools } : {}),
            messages,
            ...(container ? { container } : {}),
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          return json({ error: `Claude API error ${res.status}: ${body.slice(0, 300)}` }, 502);
        }
        const data = await res.json();
        content = data.content ?? [];
        const cid = typeof data.container === "string" ? data.container : data.container?.id;
        if (cid) container = cid;
        if (data.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content });
          continue;
        }
        break;
      }
    } finally {
      clearTimeout(timeout);
    }

    const text = content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
    const context = extractJson(text);
    if (!context) return json({ error: "Could not analyze the business. Try again." }, 502);

    // Persist to the workspace (RLS: owner can update their team).
    const patch: Record<string, unknown> = { business_context: context };
    if (url) patch.website_url = url;
    if (desc) patch.business_description = desc;
    const { error: upErr } = await userClient.from("teams").update(patch).eq("id", teamId);
    if (upErr) return json({ error: `Could not save context: ${upErr.message}` }, 500);

    return json({ context });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
