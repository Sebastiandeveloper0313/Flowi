// Senable - Slack bot. DM Senable (or @mention it) in Slack and it does real work:
// same operator brain, same connected tools, same approval gate as the web chat.
// The Slack user is matched to their Senable account by email (users:read.email),
// so there is no linking flow: if your Slack email has a Senable account, it works.
import { createClient } from "jsr:@supabase/supabase-js@2";

import { queueApproval } from "../_shared/approvals.ts";
import {
  composioEnabled,
  executeComposioTool,
  isComposioTool,
  isWriteTool,
  toolsForUser,
} from "../_shared/composio.ts";
import { autonomyMode, chatSystem, fetchWorkspaceContext } from "../_shared/marketing.ts";
import { meter } from "../_shared/usage.ts";

const enc = new TextEncoder();

/** Verify Slack's request signature (HMAC-SHA256 of v0:timestamp:body). */
async function validSignature(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get("SLACK_SIGNING_SECRET");
  if (!secret) return false;
  const ts = req.headers.get("x-slack-request-timestamp") ?? "";
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const given = req.headers.get("x-slack-signature") ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`v0:${ts}:${body}`));
  const expected = `v0=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/**
 * Convert common standard-markdown slips to Slack mrkdwn: **bold** -> *bold*,
 * __bold__ -> *bold*, [text](url) -> <url|text>, and "# Heading" -> *Heading*.
 * The model is told to write mrkdwn already; this is the deterministic net.
 */
function toMrkdwn(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/__([^_]+)__/g, "*$1*")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "<$2|$1>")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
}

// deno-lint-ignore no-explicit-any
async function slackApi(token: string, method: string, payload: Record<string, any>): Promise<any> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function slackUserEmail(token: string, userId: string): Promise<string | null> {
  const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const d = await res.json();
  return d?.user?.profile?.email ?? null;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Recent turns of a DM with Senable, oldest first, so follow-ups have context.
 * Bot messages become assistant turns; consecutive same-role turns are merged
 * (the API wants alternation); leading assistant turns are dropped. Returns []
 * on any failure so the caller degrades gracefully to a stateless reply.
 */
async function dmHistory(token: string, channel: string, excludeTs: string): Promise<Turn[]> {
  try {
    const res = await fetch(
      `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}&limit=12`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const d = await res.json();
    if (!d.ok) return [];
    // deno-lint-ignore no-explicit-any
    const raw = (d.messages ?? []) as any[];
    const turns: Turn[] = [];
    for (const m of raw.reverse()) {
      if (m.type !== "message" || m.subtype || !m.text || m.ts === excludeTs) continue;
      const role: Turn["role"] = m.bot_id ? "assistant" : "user";
      const content = String(m.text).slice(0, 3000);
      const last = turns[turns.length - 1];
      if (last && last.role === role) last.content += `\n\n${content}`;
      else turns.push({ role, content });
    }
    while (turns.length && turns[0].role === "assistant") turns.shift();
    return turns.slice(-10);
  } catch {
    return [];
  }
}

/**
 * The bot token for the Slack workspace an event came from. Installed
 * workspaces live in slack_workspaces (written by the slack-oauth install);
 * the env token remains as a fallback for the original internal install.
 */
// deno-lint-ignore no-explicit-any
async function tokenForWorkspace(
  admin: any,
  slackTeamId: string | undefined,
): Promise<string | null> {
  if (slackTeamId) {
    const { data } = await admin.rpc("slack_workspace_token", { p_slack_team_id: slackTeamId });
    if (typeof data === "string" && data) return data;
  }
  return Deno.env.get("SLACK_BOT_TOKEN") ?? null;
}

/** Find the Senable team for an email address (service role; matched case-insensitively). */
// deno-lint-ignore no-explicit-any
async function teamForEmail(admin: any, email: string): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = (data?.users ?? []).find(
    (u: { email?: string }) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!user) return null;
  const { data: member } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  return member?.team_id ?? null;
}

/** Run the operator loop over the conversation so far; returns the reply text. */
// deno-lint-ignore no-explicit-any
async function runSenable(admin: any, teamId: string, convo: Turn[]): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return "Senable isn't configured on the server yet.";

  const ws = await fetchWorkspaceContext(admin, teamId);
  const mode = autonomyMode(ws);
  const system =
    chatSystem(ws) +
    "\n\nYou are talking to the user over SLACK right now. Format for Slack's mrkdwn, which is NOT " +
    "standard markdown: bold is *single asterisks* (never **double**), italic is _underscores_, " +
    "links are <https://url|text>, bullets are plain dashes. No headers, no tables. Keep replies " +
    "short. You cannot create or propose agents from Slack; if they want one, point them to their " +
    "Senable dashboard. Everything else works: answer, use the connected tools, and take actions per " +
    "the autonomy rules above.";

  const connectedTools = composioEnabled() ? await toolsForUser(teamId).catch(() => []) : [];
  const tools: unknown[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 3 },
    ...connectedTools,
  ];
  const messages: { role: string; content: unknown }[] = convo.map((t) => ({
    role: t.role,
    content: t.content,
  }));

  for (let i = 0; i < 8; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 2048, system, tools, messages }),
    });
    if (!res.ok) return `Something went wrong talking to the AI (${res.status}). Try again.`;
    const data = await res.json();
    const content = data.content ?? [];

    if (data.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content });
      continue;
    }
    if (data.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content });
      const results: unknown[] = [];
      for (const b of content) {
        if (b.type !== "tool_use") continue;
        if (!isComposioTool(b.name)) {
          results.push({
            type: "tool_result",
            tool_use_id: b.id,
            content: "Unknown tool.",
            is_error: true,
          });
          continue;
        }
        if (isWriteTool(b.name) && mode === "ask") {
          const { message } = await queueApproval(admin, {
            teamId,
            toolSlug: b.name,
            toolArgs: b.input ?? {},
            source: "chat",
          });
          results.push({ type: "tool_result", tool_use_id: b.id, content: message });
          continue;
        }
        try {
          const out = await executeComposioTool(teamId, b.name, b.input ?? {});
          results.push({ type: "tool_result", tool_use_id: b.id, content: out });
        } catch (e) {
          results.push({
            type: "tool_result",
            tool_use_id: b.id,
            content: `Error: ${e instanceof Error ? e.message : String(e)}`,
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const reply = content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();
    return (reply || "Done.").replace(/\s*—\s*/g, ", ");
  }
  return "That took too many steps; try breaking it into smaller asks.";
}

// deno-lint-ignore no-explicit-any
async function handleEvent(event: any, slackTeamId: string | undefined): Promise<void> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const token = await tokenForWorkspace(admin, slackTeamId);
  if (!token) return; // workspace unknown and no fallback configured
  const channel = event.channel as string;
  const threadTs = (event.thread_ts ?? undefined) as string | undefined;
  const post = (text: string) =>
    slackApi(token, "chat.postMessage", {
      channel,
      text: toMrkdwn(text),
      ...(threadTs ? { thread_ts: threadTs } : {}),
    });

  const email = await slackUserEmail(token, event.user);
  if (!email) {
    await post("I couldn't read your Slack email, so I can't find your Senable account.");
    return;
  }
  const teamId = await teamForEmail(admin, email);
  if (!teamId) {
    await post(
      `I don't see a Senable account for ${email}. Sign up at https://flowy-omega.vercel.app and message me again.`,
    );
    return;
  }

  // Slack messages share the same daily AI budget as the web chat.
  const usage = await meter(teamId, "chat");
  if (!usage.ok) {
    await post(`Daily chat limit reached (${usage.limit} messages). It resets over the next day.`);
    return;
  }

  // Strip the bot @mention when addressed in a channel.
  const text = String(event.text ?? "")
    .replace(/<@[A-Z0-9]+>/g, "")
    .trim();
  if (!text) return;

  // Conversation memory: DMs carry their recent history so follow-ups work
  // ("yes, do that"). Channel mentions stay stateless (no channel-history
  // scope). Degrades to stateless if the history fetch fails.
  const isDm = event.channel_type === "im";
  const history = isDm ? await dmHistory(token, channel, String(event.ts ?? "")) : [];
  const convo: Turn[] = [...history];
  const last = convo[convo.length - 1];
  if (last && last.role === "user") last.content += `\n\n${text}`;
  else convo.push({ role: "user", content: text });

  try {
    const reply = await runSenable(admin, teamId, convo);
    await post(reply);
  } catch (e) {
    await post(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const body = await req.text();
  // deno-lint-ignore no-explicit-any
  let payload: any = {};
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  // Slack's endpoint verification handshake. Answered before the app's signing
  // secret is configured so the app can be created pointing at this URL.
  if (payload.type === "url_verification") {
    return new Response(JSON.stringify({ challenge: payload.challenge }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (!(await validSignature(req, body))) {
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }

  // Slack retries on slow responses; process each event only once.
  if (req.headers.get("x-slack-retry-num")) return new Response("ok");

  const event = payload.event ?? {};
  const isDm = event.type === "message" && event.channel_type === "im";
  const isMention = event.type === "app_mention";
  const fromHuman = !event.bot_id && !event.subtype && !!event.user;
  if ((isDm || isMention) && fromHuman) {
    // Ack within Slack's 3s window; do the real work in the background.
    const work = handleEvent(event, payload.team_id);
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(work);
  }
  return new Response("ok");
});
