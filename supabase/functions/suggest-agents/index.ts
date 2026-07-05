// Sentrive - suggest-agents. Generates starter agent proposals tailored to the
// team's business context, so a fresh dashboard is never blank. Stateless: the
// client caches results; calling again generates fresh ideas.
import { createClient } from "jsr:@supabase/supabase-js@2";

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

const SUGGEST_TOOL = {
  name: "suggest_agents",
  description: "Return the starter agents to propose for this business.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short agent name, e.g. 'Reddit Lead Watch'." },
            pitch: {
              type: "string",
              description:
                "One sentence, second person, why this agent matters for THIS business specifically. Max 120 chars.",
            },
            instructions: {
              type: "string",
              description:
                "Clear, self-contained instructions for each run, referencing the business specifics.",
            },
            schedule_cron: {
              type: "string",
              description: "5-field cron, e.g. '0 9 * * *' daily 9am, '0 9 * * 1' Mondays 9am.",
            },
            channel: { type: "string", enum: ["dashboard", "email"] },
            kind: { type: "string", enum: ["content", "reddit_monitor"] },
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "reddit_monitor only: 3-5 buyer-intent search phrases.",
            },
            subreddits: {
              type: "array",
              items: { type: "string" },
              description: "reddit_monitor only: 3-6 real subreddit names without r/.",
            },
          },
          required: ["title", "pitch", "instructions", "schedule_cron", "kind"],
        },
      },
    },
    required: ["suggestions"],
  },
};

const SYSTEM = `You design starter agents for Sentrive, an AI marketing employee. A new customer just finished onboarding; their dashboard should greet them with three ready-to-create agents tailored to their business, not a blank screen.

Given the business context, propose EXACTLY three agents:
1. A reddit_monitor lead watch: daily, with buyer-intent keywords and real subreddits where this business's customers actually ask for help. This is the flagship suggestion; make the keywords specific enough to find people describing the problem this business solves.
2. A content agent that drafts a weekly LinkedIn company post in the brand's voice, grounded in what the business does. Weekly, Monday morning.
3. Your best judgment: pick the most valuable third agent for THIS business (for example a weekly competitor scan delivered by email, a Facebook page post cadence, or a second Reddit angle for a different audience segment).

Rules: every title and pitch must be specific to the business, never generic. Instructions must be self-contained and reference the product and audience. Schedules in cron, sensible times (morning, business days where relevant). Never use em dashes anywhere; use commas, periods, or parentheses.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
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

    const { data: team } = await userClient
      .from("teams")
      .select("id, name, website_url, business_context")
      .limit(1)
      .maybeSingle();
    if (!team) return json({ error: "no team for user" }, 403);
    if (!team.business_context) {
      return json({ error: "Analyze your website first so suggestions fit your business." }, 409);
    }

    const usage = await meter(team.id, "suggest_agents");
    if (!usage.ok) return json({ error: "Daily suggestion limit reached." }, 429);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "AI is not configured on the server." }, 503);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        system: SYSTEM,
        tools: [SUGGEST_TOOL],
        tool_choice: { type: "tool", name: "suggest_agents" },
        messages: [
          {
            role: "user",
            content: `Business: ${team.name ?? "unknown"}\nWebsite: ${team.website_url ?? "not provided"}\nBusiness context:\n${JSON.stringify(team.business_context, null, 2)}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return json({ error: `Claude API error ${res.status}: ${body.slice(0, 300)}` }, 502);
    }
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const toolUse = (data.content ?? []).find((b: any) => b.type === "tool_use");
    // deno-lint-ignore no-explicit-any
    const raw: any[] = toolUse?.input?.suggestions ?? [];

    const suggestions = raw
      .filter((s) => s && typeof s.title === "string" && typeof s.instructions === "string")
      .slice(0, 3)
      .map((s, i) => ({
        id: `suggested-${Date.now()}-${i}`,
        title: String(s.title).slice(0, 200),
        pitch: typeof s.pitch === "string" ? s.pitch.slice(0, 200) : "",
        instructions: String(s.instructions),
        schedule_cron: typeof s.schedule_cron === "string" ? s.schedule_cron : "0 9 * * *",
        timezone: "UTC",
        channel: s.channel === "email" ? "email" : "dashboard",
        kind: s.kind === "reddit_monitor" ? "reddit_monitor" : "content",
        keywords: Array.isArray(s.keywords) ? s.keywords.slice(0, 8).map(String) : [],
        subreddits: Array.isArray(s.subreddits) ? s.subreddits.slice(0, 8).map(String) : [],
      }));

    if (!suggestions.length) return json({ error: "Could not generate suggestions." }, 502);
    return json({ suggestions });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
