// Sentrive - integrations. Lets a workspace connect its own tool accounts (Gmail, etc.)
// through Composio hosted auth, and lists what's connected. Authorized as the user;
// the team_id is the Composio user_id, so a team only ever sees its own connections.
import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  composioEnabled,
  createConnectLink,
  listConnections,
  SUPPORTED_TOOLKITS,
} from "../_shared/composio.ts";
import { resolveTeamId } from "../_shared/team.ts";
import { deliverWebhook } from "../_shared/webhook.ts";

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

    const {
      action,
      toolkit,
      team_id,
      site_url,
      username,
      app_password,
      url: hook_url,
    } = await req.json().catch(() => ({}));

    const teamId = await resolveTeamId(userClient, team_id);
    if (!teamId) return json({ error: "no team for user" }, 403);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

      // Slack isn't a Composio toolkit: it counts as connected when this team
      // has completed an "Add to Slack" install.
      const { count } = await admin
        .from("slack_workspaces")
        .select("id", { count: "exact", head: true })
        .eq("installed_by_team_id", teamId);
      toolkits.push({
        slug: "slack",
        connected: (count ?? 0) > 0,
        status: (count ?? 0) > 0 ? "ACTIVE" : "not_connected",
      });

      // WordPress isn't Composio either: connected when the team has stored
      // site credentials (the secret itself lives in Vault).
      const { data: wp } = await admin
        .from("connections")
        .select("label")
        .eq("team_id", teamId)
        .eq("provider", "wordpress")
        .maybeSingle();
      toolkits.push({
        slug: "wordpress",
        connected: !!wp,
        status: wp ? "ACTIVE" : "not_connected",
        site: wp?.label ?? null,
      });

      // Custom-website webhook: connected when the team has stored an endpoint
      // (the signing secret itself lives in Vault).
      const { data: hook } = await admin
        .from("connections")
        .select("label")
        .eq("team_id", teamId)
        .eq("provider", "webhook")
        .maybeSingle();
      toolkits.push({
        slug: "webhook",
        connected: !!hook,
        status: hook ? "ACTIVE" : "not_connected",
        site: hook?.label ?? null,
      });

      return json({ toolkits });
    }

    // Connect a WordPress site with an Application Password (WP 5.6+, built in:
    // WP Admin -> Users -> Profile -> Application Passwords). We verify the
    // credentials against the site's own REST API before storing anything, and
    // the password goes straight into Vault via a service-role-only function.
    if (action === "wordpress_connect") {
      const site = String(site_url ?? "")
        .trim()
        .replace(/\/+$/, "");
      const wpUser = String(username ?? "").trim();
      const wpPass = String(app_password ?? "").trim();
      if (!/^https:\/\/[^\s]+\.[^\s]+/.test(site) || !wpUser || !wpPass) {
        return json(
          { error: "A site URL (https://...), username, and application password are required." },
          400,
        );
      }
      const auth = `Basic ${btoa(`${wpUser}:${wpPass}`)}`;
      let me: { id?: number; name?: string } = {};
      try {
        const res = await fetch(`${site}/wp-json/wp/v2/users/me`, {
          headers: { Authorization: auth },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          const why =
            res.status === 401 || res.status === 403
              ? "The username or application password was rejected."
              : `The site's REST API answered ${res.status}.`;
          return json({ error: `Couldn't connect to ${site}: ${why}` }, 400);
        }
        me = await res.json().catch(() => ({}));
        if (!me?.id) {
          return json(
            {
              error: `${site} doesn't look like a WordPress site with the REST API enabled (no /wp-json/wp/v2).`,
            },
            400,
          );
        }
      } catch {
        return json(
          { error: `Couldn't reach ${site}. Check the URL is right and publicly accessible.` },
          400,
        );
      }
      const { error: storeErr } = await admin.rpc("wordpress_store_connection", {
        p_team_id: teamId,
        p_site_url: site,
        p_username: wpUser,
        p_app_password: wpPass,
      });
      if (storeErr)
        return json({ error: `Could not save the connection: ${storeErr.message}` }, 500);
      return json({ ok: true, site, connected_as: me.name ?? wpUser });
    }

    // Connect a custom website: the user gives us an endpoint URL, we generate
    // a signing secret, prove the endpoint answers a signed ping with a 2xx,
    // then store both (secret in Vault). The secret is returned exactly once so
    // the user can add signature verification to their site.
    if (action === "webhook_connect") {
      const endpoint = String(hook_url ?? "")
        .trim()
        .replace(/\/+$/, "");
      if (!/^https:\/\/[^\s]+\.[^\s]+/.test(endpoint)) {
        return json({ error: "An https:// endpoint URL is required." }, 400);
      }
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const secret =
        "whsec_" +
        Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      try {
        const res = await deliverWebhook(endpoint, secret, {
          event: "ping",
          message: "Sentrive webhook test. Respond with any 2xx status to finish connecting.",
          sent_at: new Date().toISOString(),
        });
        if (!res.ok) {
          return json(
            {
              error: `Your endpoint answered ${res.status} to the test ping. It needs to respond with a 2xx status.`,
            },
            400,
          );
        }
      } catch {
        return json(
          { error: `Couldn't reach ${endpoint}. Check the URL is right and publicly accessible.` },
          400,
        );
      }
      const { error: storeErr } = await admin.rpc("webhook_store_connection", {
        p_team_id: teamId,
        p_url: endpoint,
        p_secret: secret,
      });
      if (storeErr)
        return json({ error: `Could not save the connection: ${storeErr.message}` }, 500);
      return json({ ok: true, url: endpoint, secret });
    }

    if (action === "webhook_disconnect") {
      const { error: delErr } = await admin.rpc("webhook_delete_connection", {
        p_team_id: teamId,
      });
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ ok: true });
    }

    if (action === "wordpress_disconnect") {
      const { error: delErr } = await admin.rpc("wordpress_delete_connection", {
        p_team_id: teamId,
      });
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ ok: true });
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
