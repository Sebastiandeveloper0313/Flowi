// Flowy — chat. The conversational way to create agents.
// The user talks to Claude; when they describe a recurring job, Claude calls the
// create_recurring_task tool and Flowy spins up the agent. Authorized as the user.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Cron } from "npm:croner@9";

import { chatSystem, fetchWorkspaceContext } from "../_shared/marketing.ts";

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

const TOOL = {
  name: "create_recurring_task",
  description:
    "Create a recurring task (an 'agent') that Flowy runs automatically on a schedule and delivers the finished result. Use whenever the user asks you to take care of a recurring job or set something up on a schedule.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short name for the agent, e.g. 'Daily sales recap'." },
      instructions: {
        type: "string",
        description: "Clear, self-contained description of what to do on each run.",
      },
      schedule_cron: {
        type: "string",
        description:
          "5-field cron expression (e.g. '0 12 * * *' for daily at noon). Omit for a one-time task.",
      },
      timezone: {
        type: "string",
        description: "IANA timezone, e.g. 'America/New_York'. Default 'UTC'.",
      },
      channel: {
        type: "string",
        enum: ["discord", "telegram", "slack", "whatsapp", "dashboard"],
        description: "Where to deliver the result. Default 'dashboard'.",
      },
      kind: {
        type: "string",
        enum: ["content", "reddit_monitor"],
        description:
          "Capability. 'content' (default) produces a written deliverable. 'reddit_monitor' watches Reddit for leads matching `keywords` and drafts replies — use this whenever the user wants to find leads/prospects or monitor Reddit.",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "For reddit_monitor: OPTIONAL seed search phrases. The agent auto-derives buyer-intent terms from the business context each run, so only pass this if the user explicitly names specific terms they want watched.",
      },
      subreddits: {
        type: "array",
        items: { type: "string" },
        description:
          "For reddit_monitor: optional subreddits to focus on (names without 'r/'). Omit to search all of Reddit.",
      },
    },
    required: ["title", "instructions"],
  },
};

interface Msg {
  role: "user" | "assistant";
  content: unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { messages } = await req.json().catch(() => ({}));
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: membership } = await userClient
      .from("team_members")
      .select("team_id")
      .limit(1)
      .maybeSingle();
    const teamId = membership?.team_id;
    if (!teamId) return json({ error: "no team for user" }, 403);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) {
      return json({
        reply:
          "I'm not fully connected yet — an Anthropic API key needs to be set on the server. Once it is, I can answer and spin up agents for you.",
        created: [],
      });
    }

    const ws = await fetchWorkspaceContext(userClient, teamId);
    const system = chatSystem(ws);

    // Only trust plain {role, content:string} turns from the client.
    const convo: Msg[] = messages
      .filter(
        (m: Msg) =>
          m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
      )
      .map((m: Msg) => ({ role: m.role, content: m.content }));

    const working: Msg[] = [...convo];
    const created: Array<{ id: string; title: string }> = [];
    let reply = "";

    for (let i = 0; i < 6; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-opus-4-8",
          max_tokens: 2048,
          system,
          tools: [TOOL],
          messages: working,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return json({ error: `Claude API error ${res.status}: ${body.slice(0, 300)}` }, 502);
      }
      const data = await res.json();

      if (data.stop_reason === "tool_use") {
        working.push({ role: "assistant", content: data.content });
        const toolResults: unknown[] = [];
        for (const block of data.content ?? []) {
          if (block.type !== "tool_use") continue;
          if (block.name === "create_recurring_task") {
            const inp = block.input ?? {};
            let cron: string | null =
              typeof inp.schedule_cron === "string" && inp.schedule_cron.trim()
                ? inp.schedule_cron.trim()
                : null;
            if (cron) {
              try {
                new Cron(cron);
              } catch {
                cron = null;
              }
            }
            const kind = inp.kind === "reddit_monitor" ? "reddit_monitor" : "content";
            const config =
              kind === "reddit_monitor"
                ? {
                    keywords: Array.isArray(inp.keywords) ? inp.keywords.map(String) : [],
                    subreddits: Array.isArray(inp.subreddits) ? inp.subreddits.map(String) : [],
                  }
                : {};
            const { data: task, error } = await userClient
              .from("tasks")
              .insert({
                team_id: teamId,
                created_by: user.id,
                title: String(inp.title ?? "Untitled task").slice(0, 200),
                instructions: String(inp.instructions ?? ""),
                channel: typeof inp.channel === "string" ? inp.channel : "dashboard",
                schedule_cron: cron,
                timezone: typeof inp.timezone === "string" ? inp.timezone : "UTC",
                status: "active",
                kind,
                config,
              })
              .select("id, title")
              .single();
            if (error) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Failed to create agent: ${error.message}`,
                is_error: true,
              });
            } else {
              created.push(task);
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Agent "${task.title}" created (id ${task.id}). It is now active.`,
              });
            }
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "Unknown tool.",
              is_error: true,
            });
          }
        }
        working.push({ role: "user", content: toolResults });
        continue;
      }

      reply = (data.content ?? [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n")
        .trim();
      break;
    }

    return json({ reply: reply || "Done.", created });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
