// Senable - Slack interactivity. Handles the Approve / Reject buttons on the
// approval notifications Senable DMs into Slack. Authorized two ways: the
// request must carry a valid Slack signature, and the clicking Slack user is
// email-matched to a Senable account that must belong to the approval's team.
import { createClient } from "jsr:@supabase/supabase-js@2";

import { decideApproval } from "../_shared/approvals.ts";

const enc = new TextEncoder();

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

/** Replace the notification message with the outcome. */
async function respond(responseUrl: string, text: string): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replace_original: true, text }),
  }).catch(() => {});
}

// deno-lint-ignore no-explicit-any
async function handleAction(payload: any): Promise<void> {
  const responseUrl = payload.response_url as string;
  const action = payload.actions?.[0];
  const decision = action?.action_id as "approve" | "reject" | undefined;
  const approvalId = action?.value as string | undefined;
  if (!responseUrl || !decision || !approvalId) return;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Workspace token (from Vault), to read the clicker's email.
  const { data: vaultToken } = await admin.rpc("slack_workspace_token", {
    p_slack_team_id: payload.team?.id ?? "",
  });
  const token = (typeof vaultToken === "string" && vaultToken) || Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) return respond(responseUrl, "This Slack workspace isn't linked to Senable anymore.");

  const info = await fetch(
    `https://slack.com/api/users.info?user=${encodeURIComponent(payload.user?.id ?? "")}`,
    { headers: { authorization: `Bearer ${token}` } },
  ).then((r) => r.json());
  const email = info?.user?.profile?.email;
  if (!email) return respond(responseUrl, "I couldn't read your Slack email to authorize this.");

  // Email -> Senable user -> must belong to the approval's team.
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const flowyUser = (users?.users ?? []).find(
    (u: { email?: string }) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!flowyUser) return respond(responseUrl, `No Senable account for ${email}.`);

  const { data: approval } = await admin
    .from("approvals")
    .select("team_id, title")
    .eq("id", approvalId)
    .maybeSingle();
  if (!approval) return respond(responseUrl, "This approval no longer exists.");

  const { data: member } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", approval.team_id)
    .eq("user_id", flowyUser.id)
    .maybeSingle();
  if (!member) return respond(responseUrl, "You don't have access to this approval.");

  const result = await decideApproval(admin, approvalId, decision, flowyUser.id);
  const text =
    result.status === "executed"
      ? `✅ Approved and done: ${approval.title}`
      : result.status === "rejected"
        ? `❌ Rejected: ${approval.title}`
        : result.status === "failed"
          ? `⚠️ Approved, but it failed: ${result.error ?? "unknown error"}`
          : `This was already handled (${result.error ?? "not pending"}).`;
  await respond(responseUrl, text);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const body = await req.text();

  if (!(await validSignature(req, body))) {
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }

  // Interactivity payloads arrive form-encoded as payload=<json>.
  const params = new URLSearchParams(body);
  // deno-lint-ignore no-explicit-any
  let payload: any = {};
  try {
    payload = JSON.parse(params.get("payload") ?? "{}");
  } catch {
    return new Response("bad request", { status: 400 });
  }

  if (payload.type === "block_actions") {
    const work = handleAction(payload);
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(work);
  }
  return new Response("ok");
});
