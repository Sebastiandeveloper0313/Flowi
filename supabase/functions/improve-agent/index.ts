// Sentrive - improve-agent. An agent reviews its OWN results and proposes
// concrete changes the user applies in one click. Every agent improves this
// way, owned by an employee or not: getting better is a property of doing the
// work, not of the org chart.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Cron } from "npm:croner@9";

import { contextBlock, fetchWorkspaceContext } from "../_shared/marketing.ts";
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

const SUGGEST_TOOL = {
  name: "suggest_improvements",
  description: "Return the changes worth making to this agent, based on its real results.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        description:
          "One sentence on how this agent is actually performing, in plain language, based on the evidence. Honest: say when it is doing fine and needs nothing.",
      },
      suggestions: {
        type: "array",
        description:
          "Zero to three concrete changes. Empty when the agent is performing well: never invent busywork.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The change in a few words, e.g. 'Drop r/startups, it brings noise'.",
            },
            why: {
              type: "string",
              description:
                "The evidence in one sentence, citing the numbers you were given (e.g. '7 of 8 leads from r/startups were skipped').",
            },
            instructions: {
              type: "string",
              description:
                "Full replacement instructions, only when the wording itself should change.",
            },
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "reddit_monitor only: full replacement keyword list.",
            },
            subreddits: {
              type: "array",
              items: { type: "string" },
              description: "reddit_monitor only: full replacement subreddit list, no 'r/'.",
            },
            schedule_cron: {
              type: "string",
              description: "New 5-field cron, only when the cadence should change.",
            },
          },
          required: ["title", "why"],
        },
      },
    },
    required: ["verdict", "suggestions"],
  },
};

const SYSTEM = `You are an agent inside Sentrive reviewing your own performance, the way a good operator reviews their own work: honestly, with evidence, and without inventing problems.

You get your instructions, your schedule, and what your recent runs actually produced (including how the user reacted: what they posted, edited, or skipped). Propose only changes the evidence supports.

Rules:
- Ground every suggestion in the numbers you were given. No vague advice ("optimize targeting"), only specific edits ("drop r/startups", "add 'looking for alternatives to' as a phrase").
- If the agent is doing fine, return an empty suggestions array and say so in the verdict. That is a success, not a failure.
- A user skipping or heavily rewriting drafts is the strongest signal something is off: targeting, tone, or both.
- Never suggest more than three. Prefer one high-confidence change over three guesses.
- Only include the fields that should actually change. Replacement lists must be complete, not deltas.
- Never use em dashes. Use commas, periods, or parentheses.`;

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

    const { task_id, team_id } = await req.json().catch(() => ({}));
    if (!task_id) return json({ error: "task_id is required" }, 400);
    const teamId = await resolveTeamId(userClient, team_id);
    if (!teamId) return json({ error: "no team for user" }, 403);

    // RLS keeps this to the user's own agents.
    const { data: task } = await userClient
      .from("tasks")
      .select("id, title, instructions, kind, schedule_cron, config, team_id")
      .eq("id", task_id)
      .maybeSingle();
    if (!task) return json({ error: "agent not found" }, 404);

    const usage = await meter(teamId, "improve_agent");
    if (!usage.ok) return json({ error: "Daily review limit reached. Try again tomorrow." }, 429);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "AI is not configured on the server." }, 503);

    // The evidence: recent runs, plus how the user reacted to what was produced.
    const { data: runs } = await userClient
      .from("task_runs")
      .select("status, summary, created_at")
      .eq("task_id", task.id)
      .order("created_at", { ascending: false })
      .limit(15);

    const evidence: string[] = [];
    for (const r of runs ?? []) {
      evidence.push(
        `- ${new Date(r.created_at).toISOString().slice(0, 10)} ${r.status}: ${(r.summary ?? "").slice(0, 200)}`,
      );
    }

    // Reddit lead agents carry the richest signal: which subreddits produced
    // leads the user actually posted, versus ones they skipped.
    let outcomes = "";
    if (task.kind === "reddit_monitor") {
      const { data: leads } = await userClient
        .from("leads")
        .select("subreddit, status, relevance")
        .eq("task_id", task.id)
        .order("created_at", { ascending: false })
        .limit(200);
      const bySub = new Map<string, { total: number; posted: number; dismissed: number }>();
      for (const l of leads ?? []) {
        const k = l.subreddit ?? "unknown";
        const s = bySub.get(k) ?? { total: 0, posted: 0, dismissed: 0 };
        s.total++;
        if (l.status === "posted") s.posted++;
        if (l.status === "dismissed") s.dismissed++;
        bySub.set(k, s);
      }
      const rows = [...bySub.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(
          ([sub, s]) =>
            `- r/${sub}: ${s.total} found, ${s.posted} replied to, ${s.dismissed} skipped`,
        );
      if (rows.length)
        outcomes = `\n\nLeads by subreddit (the user's reaction is the signal):\n${rows.join("\n")}`;
    }

    const ws = await fetchWorkspaceContext(userClient, teamId);
    const cfg = (task.config ?? {}) as { keywords?: string[]; subreddits?: string[] };

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
        max_tokens: 1600,
        system: SYSTEM + contextBlock(ws),
        tools: [SUGGEST_TOOL],
        tool_choice: { type: "tool", name: "suggest_improvements" },
        messages: [
          {
            role: "user",
            content:
              `My name: ${task.title}\nKind: ${task.kind ?? "content"}\nSchedule (cron): ${task.schedule_cron ?? "on demand"}\n` +
              `Keywords: ${(cfg.keywords ?? []).join(", ") || "auto-derived each run"}\n` +
              `Subreddits: ${(cfg.subreddits ?? []).join(", ") || "all of Reddit"}\n\n` +
              `My instructions:\n${task.instructions}\n\n` +
              `My recent runs:\n${evidence.join("\n") || "none yet"}${outcomes}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return json({ error: `AI error ${res.status}: ${body.slice(0, 200)}` }, 502);
    }
    const data = await res.json();
    const block = (data.content ?? []).find(
      (b: { type: string; name?: string }) =>
        b.type === "tool_use" && b.name === "suggest_improvements",
    );
    const input = (block?.input ?? {}) as {
      verdict?: string;
      suggestions?: Array<Record<string, unknown>>;
    };

    // Validate crons here so a bad suggestion can never be applied.
    const suggestions = (input.suggestions ?? []).slice(0, 3).map((s, i) => {
      let cron = typeof s.schedule_cron === "string" ? s.schedule_cron.trim() : "";
      if (cron) {
        try {
          new Cron(cron);
        } catch {
          cron = "";
        }
      }
      return {
        id: `${task.id}-${i}`,
        title: String(s.title ?? "Change"),
        why: String(s.why ?? ""),
        changes: {
          ...(typeof s.instructions === "string" && s.instructions.trim()
            ? { instructions: s.instructions.trim() }
            : {}),
          ...(Array.isArray(s.keywords) ? { keywords: s.keywords.map(String) } : {}),
          ...(Array.isArray(s.subreddits)
            ? { subreddits: s.subreddits.map((x) => String(x).replace(/^r\//i, "")) }
            : {}),
          ...(cron ? { schedule_cron: cron } : {}),
        },
      };
    });

    return json({
      verdict: String(input.verdict ?? "").trim(),
      // Drop suggestions that carry no actual change to apply.
      suggestions: suggestions.filter((s) => Object.keys(s.changes).length > 0),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
