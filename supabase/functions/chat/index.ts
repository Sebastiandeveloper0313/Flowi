// Flowy - chat. The conversational way to create agents.
// The user talks to Claude; when they describe a recurring job, Claude calls the
// create_recurring_task tool and Flowy spins up the agent. Authorized as the user.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Cron } from "npm:croner@9";

import { queueApproval } from "../_shared/approvals.ts";
import {
  composioEnabled,
  executeComposioTool,
  isComposioTool,
  isWriteTool,
  toolsForUser,
} from "../_shared/composio.ts";
import { autonomyMode, chatSystem, fetchWorkspaceContext } from "../_shared/marketing.ts";

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
  name: "propose_agent",
  description:
    "Propose a recurring task (an 'agent') that Flowy would run automatically on a schedule. This does NOT create it: the user sees a card summarizing the agent and clicks Create to set it up. Use whenever the user asks you to take care of a recurring job, OR proactively when you notice something worth automating for them. You can propose more than one.",
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
          "Capability. 'content' (default) produces a written deliverable. 'reddit_monitor' watches Reddit for leads matching `keywords` and drafts replies - use this whenever the user wants to find leads/prospects or monitor Reddit.",
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

const SET_AUTONOMY_TOOL = {
  name: "set_autonomy_mode",
  description:
    "Change how much Flowy does on its own for this workspace. Use when the user asks you to stop asking and just handle things ('auto'), or to always check with them before acting ('ask'). Affects the chat and all agents.",
  input_schema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["ask", "auto"],
        description:
          "'ask' = high-stakes actions wait for the user's approval. 'auto' = Flowy carries them out on its own.",
      },
    },
    required: ["mode"],
  },
};

interface Msg {
  role: "user" | "assistant";
  content: unknown;
}

/** A proposed agent the user confirms (client creates it on the "Create agent" button). */
interface AgentProposal {
  id: string;
  title: string;
  instructions: string;
  channel: string;
  schedule_cron: string | null;
  timezone: string;
  kind: "content" | "reddit_monitor";
  keywords: string[];
  subreddits: string[];
}

/** Friendly "what I'm doing" text for a tool call, shown live in the chat. */
function statusForTool(slug: string): string {
  const map: Record<string, string> = {
    GMAIL_FETCH_EMAILS: "Reading your inbox",
    GMAIL_FETCH_MESSAGE_BY_THREAD_ID: "Reading the thread",
    GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: "Reading the email",
    GMAIL_LIST_THREADS: "Scanning your inbox",
    GMAIL_GET_PROFILE: "Checking your account",
    GMAIL_CREATE_EMAIL_DRAFT: "Drafting a reply",
    GMAIL_SEND_EMAIL: "Sending an email",
    GMAIL_SEARCH_PEOPLE: "Searching contacts",
    REDDIT_SEARCH_ACROSS_SUBREDDITS: "Searching Reddit",
    LINKEDIN_GET_MY_INFO: "Checking your LinkedIn",
    LINKEDIN_CREATE_LINKED_IN_POST: "Publishing to LinkedIn",
  };
  if (map[slug]) return map[slug];
  const toolkit = slug.split("_")[0] ?? "";
  return toolkit ? `Working in ${toolkit.charAt(0) + toolkit.slice(1).toLowerCase()}` : "Working";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { messages, attachments } = await req.json().catch(() => ({}));
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
          "I'm not fully connected yet - an Anthropic API key needs to be set on the server. Once it is, I can answer and spin up agents for you.",
        created: [],
      });
    }

    const ws = await fetchWorkspaceContext(userClient, teamId);
    const system = chatSystem(ws);
    let mode = autonomyMode(ws);

    // The workspace's connected tools (Gmail, etc.) so the chat can do real work,
    // not just talk. Executed against this team's own accounts via Composio.
    const connectedTools = composioEnabled() ? await toolsForUser(teamId).catch(() => []) : [];

    // Only trust plain {role, content:string} turns from the client.
    const convo: Msg[] = messages
      .filter(
        (m: Msg) =>
          m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
      )
      .map((m: Msg) => ({ role: m.role, content: m.content }));

    // Attach uploaded files (images / PDFs) to the latest user turn so Claude can see them.
    if (Array.isArray(attachments) && attachments.length > 0 && convo.length > 0) {
      const last = convo[convo.length - 1];
      if (last.role === "user" && typeof last.content === "string") {
        // deno-lint-ignore no-explicit-any
        const blocks: any[] = [];
        for (const a of attachments) {
          if (!a?.data || typeof a.mediaType !== "string") continue;
          if (a.kind === "image") {
            blocks.push({
              type: "image",
              source: { type: "base64", media_type: a.mediaType, data: a.data },
            });
          } else if (a.kind === "document") {
            blocks.push({
              type: "document",
              source: { type: "base64", media_type: a.mediaType, data: a.data },
            });
          }
        }
        if (blocks.length > 0) {
          blocks.push({ type: "text", text: last.content });
          convo[convo.length - 1] = { role: "user", content: blocks };
        }
      }
    }

    // Stream "what I'm doing" status events as Flowy works, then the final reply.
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) =>
          controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        const working: Msg[] = [...convo];
        const created: Array<{ id: string; title: string }> = [];
        const proposals: AgentProposal[] = [];
        let reply = "";
        try {
          for (let i = 0; i < 10; i++) {
            send({ type: "status", text: "Thinking" });
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
                tools: [TOOL, SET_AUTONOMY_TOOL, ...connectedTools],
                messages: working,
              }),
            });
            if (!res.ok) {
              const body = await res.text();
              send({
                type: "error",
                error: `Claude API error ${res.status}: ${body.slice(0, 300)}`,
              });
              return;
            }
            const data = await res.json();

            if (data.stop_reason === "tool_use") {
              working.push({ role: "assistant", content: data.content });
              const toolResults: unknown[] = [];
              for (const block of data.content ?? []) {
                if (block.type !== "tool_use") continue;
                if (block.name === "propose_agent") {
                  send({ type: "status", text: "Designing an agent" });
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
                  const proposal = {
                    id: block.id,
                    title: String(inp.title ?? "Untitled agent").slice(0, 200),
                    instructions: String(inp.instructions ?? ""),
                    channel: typeof inp.channel === "string" ? inp.channel : "dashboard",
                    schedule_cron: cron,
                    timezone: typeof inp.timezone === "string" ? inp.timezone : "UTC",
                    kind,
                    keywords:
                      kind === "reddit_monitor" && Array.isArray(inp.keywords)
                        ? inp.keywords.map(String)
                        : [],
                    subreddits:
                      kind === "reddit_monitor" && Array.isArray(inp.subreddits)
                        ? inp.subreddits.map(String)
                        : [],
                  };
                  proposals.push(proposal);
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content:
                      `Proposed the agent "${proposal.title}" to the user. They now see a card and ` +
                      `click Create to set it up. Do not say it is created, active, or running; it ` +
                      `is only a proposal until they create it. Keep your reply to a short line.`,
                  });
                } else if (block.name === "set_autonomy_mode") {
                  const next = block.input?.mode === "auto" ? "auto" : "ask";
                  const { error } = await userClient
                    .from("teams")
                    .update({ autonomy_mode: next })
                    .eq("id", teamId);
                  if (error) {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: `Could not change the mode: ${error.message}`,
                      is_error: true,
                    });
                  } else {
                    mode = next; // honor the new mode for the rest of this turn
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content:
                        next === "auto"
                          ? "Autonomy set to auto. Flowy will now carry out actions on its own."
                          : "Autonomy set to ask. Flowy will queue actions for your approval.",
                    });
                  }
                } else if (
                  isComposioTool(block.name) &&
                  isWriteTool(block.name) &&
                  mode === "ask"
                ) {
                  // High-stakes action in ask mode: queue it for approval, never send now.
                  send({ type: "status", text: "Waiting for your approval" });
                  const { message } = await queueApproval(userClient, {
                    teamId,
                    toolSlug: block.name,
                    toolArgs: block.input ?? {},
                    source: "chat",
                    createdBy: user.id,
                  });
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: message,
                  });
                } else if (isComposioTool(block.name)) {
                  send({ type: "status", text: statusForTool(block.name) });
                  try {
                    const out = await executeComposioTool(teamId, block.name, block.input ?? {});
                    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
                  } catch (e) {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: `Error: ${e instanceof Error ? e.message : String(e)}`,
                      is_error: true,
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
          // Honor the no-em-dash rule regardless of the model.
          reply = reply.replace(/\s*—\s*/g, ", ");
          send({ type: "done", reply: reply || "Done.", created, proposals });
        } catch (e) {
          send({ type: "error", error: e instanceof Error ? e.message : String(e) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache" },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
