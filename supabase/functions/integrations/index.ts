// Flowy - integrations. Lets a workspace connect its own tool accounts (Gmail, etc.)
// through Composio hosted auth, and lists what's connected. Authorized as the user;
// the team_id is the Composio user_id, so a team only ever sees its own connections.
import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  composioEnabled,
  createConnectLink,
  listConnections,
  SUPPORTED_TOOLKITS,
} from "../_shared/composio.ts";

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
    if (!composioEnabled()) {
      return json({ error: "Integrations are not configured on the server." }, 503);
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

    const { action, toolkit } = await req.json().catch(() => ({}));

    // List the toolkits we support and the team's current connection status for each.
    if (action === "list") {
      const conns = await listConnections(teamId);
      const statusByToolkit: Record<string, string> = {};
      for (const c of conns) {
        // prefer an ACTIVE connection if the team has several
        if (c.status === "ACTIVE" || !statusByToolkit[c.toolkit])
          statusByToolkit[c.toolkit] = c.status;
      }
      const toolkits = SUPPORTED_TOOLKITS.map((slug) => ({
        slug,
        connected: statusByToolkit[slug] === "ACTIVE",
        status: statusByToolkit[slug] ?? "not_connected",
      }));
      return json({ toolkits });
    }

    // Start a connection: return the hosted-auth URL for the user to authorize.
    if (action === "connect") {
      if (typeof toolkit !== "string" || !SUPPORTED_TOOLKITS.includes(toolkit)) {
        return json({ error: "Unknown or unsupported toolkit." }, 400);
      }
      const { redirect_url } = await createConnectLink(teamId, toolkit);
      return json({ redirect_url });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
