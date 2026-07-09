// Sentrive - chat. The conversational way to create agents.
// The user talks to Claude; when they describe a recurring job, Claude calls the
// create_recurring_task tool and Sentrive spins up the agent. Authorized as the user.
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

const TOOL = {
  name: "propose_agent",
  description:
    "Propose a recurring task (an 'agent') that Sentrive would run automatically on a schedule. This does NOT create it: the user sees a card summarizing the agent and clicks Create to set it up. Use whenever the user asks you to take care of a recurring job, OR proactively when you notice something worth automating for them. You can propose more than one.",
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
        enum: ["dashboard", "email"],
        description:
          "Where to deliver the result each run. 'email' sends it to the user's own inbox (their connected Gmail); 'dashboard' keeps it in the app. Default 'dashboard'; pick 'email' when they ask to be emailed / sent the result.",
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

const UPDATE_TOOL = {
  name: "update_agent",
  description:
    "Change an agent the user ALREADY created (from the current agents list), instead of making a new one. Use whenever they want to adjust, edit, rename, reschedule, refocus, or retarget an existing agent (e.g. 'make it run twice a day', 'also watch r/hvac', 'change the instructions to...'). This does NOT apply immediately: the user sees a card showing what changes and clicks Confirm. Only include the fields that should change; leave the rest out. If it is unclear which existing agent they mean, ask a brief question instead of guessing.",
  input_schema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "The id of the existing agent to change, taken from the current agents list.",
      },
      title: { type: "string", description: "New name, only if renaming." },
      instructions: {
        type: "string",
        description: "Full replacement instructions, only if the user wants them changed.",
      },
      schedule_cron: {
        type: "string",
        description:
          "New 5-field cron, only if the schedule should change. Use 'once' for one-off.",
      },
      channel: {
        type: "string",
        enum: ["dashboard", "email"],
        description: "New delivery, only if it should change.",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "reddit_monitor only: replacement search phrases, only if the user names them.",
      },
      subreddits: {
        type: "array",
        items: { type: "string" },
        description: "reddit_monitor only: replacement subreddits (no 'r/'), only if changing.",
      },
    },
    required: ["agent_id"],
  },
};

const SET_AUTONOMY_TOOL = {
  name: "set_autonomy_mode",
  description:
    "Change how much Sentrive does on its own for this workspace. Use when the user asks you to stop asking and just handle things ('auto'), or to always check with them before acting ('ask'). Affects the chat and all agents.",
  input_schema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["ask", "auto"],
        description:
          "'ask' = high-stakes actions wait for the user's approval. 'auto' = Sentrive carries them out on its own.",
      },
    },
    required: ["mode"],
  },
};

const ANALYZE_TOOL = {
  name: "analyze_website",
  description:
    "Read the user's company website and update what Sentrive knows about their business (the business context that grounds every agent and reply). Use this whenever the user gives you a website URL, asks you to look at or read their site, or when you clearly do not know what their business does and a URL is available. It scrapes the site and saves the result. Afterwards, tell the user in one or two lines what you now understand about their business and that it's saved, do not dump raw fields.",
  input_schema: {
    type: "object",
    properties: {
      website_url: {
        type: "string",
        description: "The company website URL to read (e.g. 'https://acme.com').",
      },
    },
    required: ["website_url"],
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

/** A proposed change to an existing agent the user confirms on a card. */
interface AgentUpdate {
  id: string; // tool_use id, used as the card key
  agentId: string;
  title: string; // the agent's name (new if renamed, else current), for the card
  kind: "content" | "reddit_monitor";
  changes: {
    title?: string;
    instructions?: string;
    schedule_cron?: string | null;
    channel?: string;
    keywords?: string[];
    subreddits?: string[];
  };
}

interface ExistingAgent {
  id: string;
  title: string;
  kind: string;
  instructions: string | null;
  schedule_cron: string | null;
  channel: string | null;
  status: string | null;
}

/** Compact list of the team's agents, so the model can reference and edit them. */
function existingAgentsBlock(agents: ExistingAgent[]): string {
  if (!agents.length) return "";
  const lines = agents.map(
    (a) =>
      `- id: ${a.id} | "${a.title}" | ${a.kind === "reddit_monitor" ? "Reddit leads" : "content"} | ` +
      `schedule: ${a.schedule_cron ?? "one-off"} | delivery: ${a.channel ?? "dashboard"} | ${a.status ?? "active"}`,
  );
  return (
    "\n\nTHIS WORKSPACE'S CURRENT AGENTS (use update_agent with the exact id to change one; " +
    "never propose a new agent when the user wants to change one of these):\n" +
    lines.join("\n")
  );
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
    LINKEDIN_GET_COMPANY_INFO: "Checking your company pages",
    LINKEDIN_CREATE_LINKED_IN_POST: "Publishing to LinkedIn",
    FACEBOOK_GET_USER_PAGES: "Checking your Facebook pages",
    FACEBOOK_GET_PAGE_POSTS: "Reading your page posts",
    FACEBOOK_GET_PAGE_CONVERSATIONS: "Checking your page inbox",
    FACEBOOK_GET_CONVERSATION_MESSAGES: "Reading the conversation",
    FACEBOOK_CREATE_POST: "Publishing to Facebook",
    FACEBOOK_CREATE_COMMENT: "Replying to a comment",
    FACEBOOK_SEND_MESSAGE: "Sending a Messenger reply",
  };
  if (map[slug]) return map[slug];
  const toolkit = slug.split("_")[0] ?? "";
  return toolkit ? `Working in ${toolkit.charAt(0) + toolkit.slice(1).toLowerCase()}` : "Working";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { messages, attachments, team_id } = await req.json().catch(() => ({}));
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

    const teamId = await resolveTeamId(userClient, team_id);
    if (!teamId) return json({ error: "no team for user" }, 403);

    // Server-side daily budget, so even a client bypassing the UI can't drain
    // the workspace's AI usage.
    const usage = await meter(teamId, "chat");
    if (!usage.ok) {
      return json(
        {
          error: `Daily chat limit reached (${usage.limit} messages). It resets over the next day.`,
        },
        429,
      );
    }

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) {
      return json({
        reply:
          "I'm not fully connected yet - an Anthropic API key needs to be set on the server. Once it is, I can answer and spin up agents for you.",
        created: [],
      });
    }

    const ws = await fetchWorkspaceContext(userClient, teamId);

    // The team's existing agents, so the chat can edit them (update_agent) rather
    // than only ever creating new ones. RLS-scoped to this team.
    const { data: agentRows } = await userClient
      .from("tasks")
      .select("id, title, kind, instructions, schedule_cron, channel, status")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(25);
    const agents = (agentRows ?? []) as ExistingAgent[];
    const agentsById = new Map(agents.map((a) => [a.id, a]));

    const system = chatSystem(ws) + existingAgentsBlock(agents);
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

    // Stream "what I'm doing" status events as Sentrive works, then the final reply.
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) =>
          controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        const working: Msg[] = [...convo];
        const created: Array<{ id: string; title: string }> = [];
        const proposals: AgentProposal[] = [];
        const updates: AgentUpdate[] = [];
        let contextUpdated = false;
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
                tools: [TOOL, UPDATE_TOOL, ANALYZE_TOOL, SET_AUTONOMY_TOOL, ...connectedTools],
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
                  const kind: "content" | "reddit_monitor" =
                    inp.kind === "reddit_monitor" ? "reddit_monitor" : "content";
                  const proposal: AgentProposal = {
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
                } else if (block.name === "update_agent") {
                  send({ type: "status", text: "Updating the agent" });
                  const inp = block.input ?? {};
                  const target = agentsById.get(String(inp.agent_id ?? ""));
                  if (!target) {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content:
                        "No agent with that id exists in this workspace. Check the current agents " +
                        "list and use the exact id, or ask the user which agent they mean.",
                      is_error: true,
                    });
                  } else {
                    const changes: AgentUpdate["changes"] = {};
                    if (typeof inp.title === "string" && inp.title.trim())
                      changes.title = inp.title.trim().slice(0, 200);
                    if (typeof inp.instructions === "string" && inp.instructions.trim())
                      changes.instructions = inp.instructions.trim();
                    if (
                      typeof inp.channel === "string" &&
                      ["dashboard", "email"].includes(inp.channel)
                    )
                      changes.channel = inp.channel;
                    if (typeof inp.schedule_cron === "string") {
                      const raw = inp.schedule_cron.trim();
                      if (raw === "once" || raw === "") {
                        changes.schedule_cron = null;
                      } else {
                        try {
                          new Cron(raw);
                          changes.schedule_cron = raw;
                        } catch {
                          // ignore an invalid cron rather than break the edit
                        }
                      }
                    }
                    if (target.kind === "reddit_monitor") {
                      if (Array.isArray(inp.keywords))
                        changes.keywords = inp.keywords.map(String).slice(0, 12);
                      if (Array.isArray(inp.subreddits))
                        changes.subreddits = inp.subreddits.map(String).slice(0, 12);
                    }

                    if (Object.keys(changes).length === 0) {
                      toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content:
                          "Nothing to change was provided. Ask the user what they want adjusted.",
                        is_error: true,
                      });
                    } else {
                      updates.push({
                        id: block.id,
                        agentId: target.id,
                        title: changes.title ?? target.title,
                        kind: target.kind === "reddit_monitor" ? "reddit_monitor" : "content",
                        changes,
                      });
                      toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content:
                          `Proposed a change to "${target.title}". The user sees a card with what ` +
                          `changes and clicks Confirm to apply it. Do not say it is already changed; ` +
                          `it applies only when they confirm. Keep your reply to a short line.`,
                      });
                    }
                  }
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
                          ? "Autonomy set to auto. Sentrive will now carry out actions on its own."
                          : "Autonomy set to ask. Sentrive will queue actions for your approval.",
                    });
                  }
                } else if (block.name === "analyze_website") {
                  send({ type: "status", text: "Reading the website" });
                  const site = String(block.input?.website_url ?? "").trim();
                  if (!site) {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: "No URL was provided. Ask the user for their website URL.",
                      is_error: true,
                    });
                  } else {
                    try {
                      // Reuse the analyze-website function (scrape + extract + save),
                      // as the user, so it lands in their workspace context.
                      const res = await fetch(`${url}/functions/v1/analyze-website`, {
                        method: "POST",
                        headers: {
                          "content-type": "application/json",
                          Authorization: authHeader,
                          apikey: anon,
                        },
                        body: JSON.stringify({ website_url: site, team_id: teamId }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok || data?.error) {
                        toolResults.push({
                          type: "tool_result",
                          tool_use_id: block.id,
                          content:
                            `Could not read ${site}: ${data?.error ?? `error ${res.status}`}. Ask the user ` +
                            "to double-check the URL, or they can paste a short description of the business instead.",
                          is_error: true,
                        });
                      } else {
                        contextUpdated = true;
                        toolResults.push({
                          type: "tool_result",
                          tool_use_id: block.id,
                          content:
                            `Read ${site} and saved the updated business context: ${JSON.stringify(data.context ?? {})}. ` +
                            "Tell the user in one or two lines what you now understand about their business and that it's saved. Do not paste the raw fields.",
                        });
                      }
                    } catch (e) {
                      toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content:
                          `Error reading ${site}: ${e instanceof Error ? e.message : String(e)}. Ask the ` +
                          "user to paste a short description of their business instead.",
                        is_error: true,
                      });
                    }
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
          send({
            type: "done",
            reply: reply || "Done.",
            created,
            proposals,
            updates,
            contextUpdated,
          });
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
