// Sentrive - approvals decision endpoint.
// The user approves or rejects a queued high-stakes action from the web app.
// Authorized by the caller's JWT: RLS ensures they can only see (and therefore
// decide) their own team's approvals. Execution runs via the shared core, the
// same one the Slack approve/reject buttons use.
import { createClient } from "jsr:@supabase/supabase-js@2";

import { decideApproval } from "../_shared/approvals.ts";

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
    const { approval_id, decision, edited_text } = await req.json().catch(() => ({}));
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
      .select("id, status")
      .eq("id", approval_id)
      .single();
    if (findErr || !approval) return json({ error: "Approval not found or access denied" }, 403);
    if (approval.status !== "pending") {
      return json({ error: `This request was already ${approval.status}.` }, 409);
    }

    const admin = createClient(url, service);
    const result = await decideApproval(
      admin,
      approval_id,
      decision,
      user.id,
      typeof edited_text === "string" ? edited_text : undefined,
    );
    if (result.status === "conflict") return json({ error: result.error }, 409);
    if (result.status === "failed") return json({ status: "failed", error: result.error }, 502);
    return json({ status: result.status });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
