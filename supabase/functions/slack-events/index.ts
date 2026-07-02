// Flowy - Slack bot. DM Flowy (or @mention it) in Slack and it does real work:
// same operator brain, same connected tools, same approval gate as the web chat.
// The Slack user is matched to their Flowy account by email (users:read.email),
// so there is no linking flow: if your Slack email has a Flowy account, it works.
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
async function slackApi(method: string, payload: Record<string, any>): Promise<any> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${Deno.env.get("SLACK_BOT_TOKEN")}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function slackUserEmail(userId: string): Promise<string | null> {
  const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
    headers: { authorization: `Bearer ${Deno.env.get("SLACK_BOT_TOKEN")}` },
  });
  const d = await res.json();
  return d?.user?.profile?.email ?? null;
}

/** Find the Flowy team for an email address (service role; matched case-insensitively). */
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

/** Run the operator loop for one Slack message and return the reply text. */
// deno-lint-ignore no-explicit-any
async function runFlowy(admin: any, teamId: string, text: string): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return "Flowy's AI isn't configured on the server yet.";

  const ws = await fetchWorkspaceContext(admin, teamId);
  const mode = autonomyMode(ws);
  const system =
    chatSystem(ws) +
    "\n\nYou are talking to the user over SLACK right now. Format for Slack's mrkdwn, which is NOT " +
    "standard markdown: bold is *single asterisks* (never **double**), italic is _underscores_, " +
    "links are <https://url|text>, bullets are plain dashes. No headers, no tables. Keep replies " +
    "short. You cannot create or propose agents from Slack; if they want one, point them to their " +
    "Flowy dashboard. Everything else works: answer, use the connected tools, and take actions per " +
    "the autonomy rules above.";

  const connectedTools = composioEnabled() ? await toolsForUser(teamId).catch(() => []) : [];
  const tools: unknown[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 3 },
    ...connectedTools,
  ];
  const messages: { role: string; content: unknown }[] = [{ role: "user", content: text }];

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
async function handleEvent(event: any): Promise<void> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const channel = event.channel as string;
  const threadTs = (event.thread_ts ?? undefined) as string | undefined;
  const post = (text: string) =>
    slackApi("chat.postMessage", {
      channel,
      text: toMrkdwn(text),
      ...(threadTs ? { thread_ts: threadTs } : {}),
    });

  const email = await slackUserEmail(event.user);
  if (!email) {
    await post("I couldn't read your Slack email, so I can't find your Flowy account.");
    return;
  }
  const teamId = await teamForEmail(admin, email);
  if (!teamId) {
    await post(
      `I don't see a Flowy account for ${email}. Sign up at https://flowy-omega.vercel.app and message me again.`,
    );
    return;
  }

  // Strip the bot @mention when addressed in a channel.
  const text = String(event.text ?? "")
    .replace(/<@[A-Z0-9]+>/g, "")
    .trim();
  if (!text) return;

  try {
    const reply = await runFlowy(admin, teamId, text);
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
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(handleEvent(event)) ?? handleEvent(event);
  }
  return new Response("ok");
});
