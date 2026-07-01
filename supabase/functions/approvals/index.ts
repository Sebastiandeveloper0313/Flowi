// Flowy - approvals decision endpoint.
// The user approves or rejects a queued high-stakes action. On approval we
// execute the exact tool + arguments that were proposed, via the team's own
// connected account, and record the outcome. Authorized by the caller's JWT:
// RLS ensures they can only touch their own team's approvals.
import { createClient } from "jsr:@supabase/supabase-js@2";

import { executeComposioTool } from "../_shared/composio.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { approval_id, decision } = await req.json().catch(() => ({}));
    if (!approval_id || (decision !== "approve" && decision !== "reject")) {
      return json({ error: "approval_id and decision ('approve'|'reject') are required" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    // RLS scopes this read to the caller's team, so finding it means they may decide it.
    const { data: approval, error: findErr } = await userClient
      .from("approvals")
      .select("id, team_id, tool_slug, tool_args, status, title")
      .eq("id", approval_id)
      .single();
    if (findErr || !approval) return json({ error: "Approval not found or access denied" }, 403);
    if (approval.status !== "pending") {
      return json({ error: `This request was already ${approval.status}.` }, 409);
    }

    const admin = createClient(url, service);
    const decidedAt = new Date().toISOString();

    if (decision === "reject") {
      await admin
        .from("approvals")
        .update({ status: "rejected", decided_by: user.id, decided_at: decidedAt })
        .eq("id", approval.id);
      return json({ status: "rejected" });
    }

    // Approve: execute the proposed action, then record the outcome.
    try {
      const result = await executeComposioTool(
        approval.team_id,
        approval.tool_slug,
        (approval.tool_args as Record<string, unknown>) ?? {},
      );
      await admin
        .from("approvals")
        .update({
          status: "executed",
          result: result.slice(0, 8000),
          decided_by: user.id,
          decided_at: decidedAt,
        })
        .eq("id", approval.id);
      return json({ status: "executed" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin
        .from("approvals")
        .update({
          status: "failed",
          result: msg.slice(0, 8000),
          decided_by: user.id,
          decided_at: decidedAt,
        })
        .eq("id", approval.id);
      return json({ status: "failed", error: msg }, 502);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
