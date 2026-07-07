// Public one-click unsubscribe for non-essential lifecycle email. The link in
// those emails carries a per-user token; hitting it flips opted_out_at so future
// win-back/nudge sends skip this user. Billing mail (cancel confirmation) is
// transactional and unaffected. No auth: the unguessable token is the credential.
import { createClient } from "jsr:@supabase/supabase-js@2";

function page(title: string, body: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title></head>
<body style="margin:0;background:#f4f7fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:460px;margin:64px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(20,40,80,.06);">
    <div style="height:6px;background:linear-gradient(90deg,#5aa6ff,#1566e6);"></div>
    <div style="padding:32px;">
      <div style="font-size:15px;font-weight:700;color:#1566e6;">Sentrive</div>
      <h1 style="font-size:20px;color:#101828;margin:14px 0 8px;">${title}</h1>
      <p style="font-size:15px;line-height:1.6;color:#475467;margin:0;">${body}</p>
    </div>
  </div>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return page("Link not valid", "This unsubscribe link is missing its token. Nothing changed.");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin
    .from("email_optout")
    .update({ opted_out_at: new Date().toISOString() })
    .eq("token", token)
    .select("user_id")
    .maybeSingle();

  if (error || !data) {
    return page(
      "Link not recognized",
      "We couldn't match this unsubscribe link. If you keep getting email you don't want, just reply and we'll sort it out.",
    );
  }

  return page(
    "You're unsubscribed",
    "You won't get any more onboarding or win-back email from Sentrive. Account and billing notices still come through, since those are about your subscription.",
  );
});
