// Flowy - Slack install (OAuth). Two jobs:
//  GET  /slack-oauth            -> 302 to Slack's consent screen ("Add to Slack")
//  GET  /slack-oauth?code=...   -> exchange the code for that workspace's bot
//                                  token, store it, and show a success page.
// A workspace row grants nothing by itself: each Slack sender is still matched
// to their own Flowy account by email in slack-events.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SCOPES = "chat:write,im:history,users:read,users:read.email,app_mentions:read";

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Flowy + Slack</title>
     <body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;background:#f3f6fb;color:#160f24">
     <div style="text-align:center;max-width:26rem">${body}</div></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const clientId = Deno.env.get("SLACK_CLIENT_ID");
  const clientSecret = Deno.env.get("SLACK_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return html("<h2>Slack install isn't configured yet.</h2>", 503);
  }
  // Behind the platform proxy req.url loses the /functions/v1 prefix and the
  // https scheme, so build the public callback URL from the project URL.
  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/slack-oauth`;

  const code = url.searchParams.get("code");
  if (!code) {
    if (url.searchParams.get("error")) {
      return html("<h2>Install cancelled</h2><p>You can close this tab.</p>");
    }
    // Start the install: send the user to Slack's consent screen.
    const authorize = new URL("https://slack.com/oauth/v2/authorize");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("scope", SCOPES);
    authorize.searchParams.set("redirect_uri", redirectUri);
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
  if (!data.ok) {
    return html(`<h2>Install failed</h2><p>${String(data.error ?? "unknown error")}</p>`, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await admin.from("slack_workspaces").upsert(
    {
      slack_team_id: data.team?.id,
      team_name: data.team?.name ?? null,
      bot_token: data.access_token,
      bot_user_id: data.bot_user_id ?? null,
    },
    { onConflict: "slack_team_id" },
  );
  if (error) return html(`<h2>Install failed</h2><p>${error.message}</p>`, 500);

  return html(
    `<h2>Flowy is in your Slack 🎉</h2>
     <p>Open Slack, find <b>Flowy</b> under Apps, and send it a message.</p>
     <p style="color:#5b6b86;font-size:.9rem">Flowy matches you by email: use the same email in Slack
     and in your Flowy account. No account yet? <a href="https://flowy-omega.vercel.app">Sign up</a>.</p>`,
  );
});
