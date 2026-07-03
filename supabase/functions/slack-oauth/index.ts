// Senable - Slack install (OAuth). Two jobs:
//  GET  /slack-oauth            -> 302 to Slack's consent screen ("Add to Slack")
//  GET  /slack-oauth?code=...   -> exchange the code for that workspace's bot
//                                  token, store it, then bounce back to the app.
// The platform sandboxes HTML served from function URLs (forced text/plain +
// CSP), so both outcomes redirect to the Integrations page, which shows the
// result from the ?slack= query param.
// A workspace row grants nothing by itself: each Slack sender is still matched
// to their own Senable account by email in slack-events.
import { createClient } from "jsr:@supabase/supabase-js@2";

// im:write lets Senable open a DM to the user proactively (approval pings).
const SCOPES = "chat:write,im:write,im:history,users:read,users:read.email,app_mentions:read";
const APP_URL = "https://flowy-omega.vercel.app";

function backToApp(result: "connected" | "cancelled" | "error", detail?: string) {
  const to = new URL(`${APP_URL}/integrations`);
  to.searchParams.set("slack", result);
  if (detail) to.searchParams.set("detail", detail.slice(0, 120));
  return Response.redirect(to.toString(), 302);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const clientId = Deno.env.get("SLACK_CLIENT_ID");
  const clientSecret = Deno.env.get("SLACK_CLIENT_SECRET");
  if (!clientId || !clientSecret) return backToApp("error", "Slack install is not configured");

  // Behind the platform proxy req.url loses the /functions/v1 prefix and the
  // https scheme, so build the public callback URL from the project URL.
  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/slack-oauth`;

  const code = url.searchParams.get("code");
  if (!code) {
    if (url.searchParams.get("error")) return backToApp("cancelled");
    // Start the install: send the user to Slack's consent screen. The Senable
    // team id rides along in `state` so the callback can mark that team's
    // Slack card as connected.
    const authorize = new URL("https://slack.com/oauth/v2/authorize");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("scope", SCOPES);
    authorize.searchParams.set("redirect_uri", redirectUri);
    const state = url.searchParams.get("state");
    if (state) authorize.searchParams.set("state", state);
    return Response.redirect(authorize.toString(), 302);
  }

  // Callback: exchange the code for this workspace's bot token.
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (!data.ok) return backToApp("error", String(data.error ?? "unknown error"));

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // The Senable team that started the install (echoed back by Slack in `state`).
  const state = url.searchParams.get("state") ?? "";
  const teamId = /^[0-9a-f-]{36}$/i.test(state) ? state : null;
  // Token goes into Vault via a service-role-only definer function; the table
  // never holds it in plaintext.
  const { error } = await admin.rpc("slack_store_workspace", {
    p_slack_team_id: data.team?.id,
    p_team_name: data.team?.name ?? null,
    p_bot_token: data.access_token,
    p_bot_user_id: data.bot_user_id ?? null,
    p_installed_by_team_id: teamId,
  });
  if (error) return backToApp("error", error.message);

  return backToApp("connected");
});
