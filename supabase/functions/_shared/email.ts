// Transactional/lifecycle email sending via Resend, plus the shared branded
// layout every Sentrive email uses. Templates live in email-templates.ts and
// compose the layout; this file only knows how to render the shell and POST to
// Resend. No em dashes anywhere (house style).

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where replies go. Defaults to the from address. */
  replyTo?: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Send one email through Resend. Never throws; returns a result to log. */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  const from = Deno.env.get("EMAIL_FROM") || "Sentrive <hello@sentrive.ai>";
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo ?? from,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The public app origin, for building links in emails. */
export function appUrl(): string {
  return (Deno.env.get("APP_URL") || "https://sentrive.ai").replace(/\/$/, "");
}

interface LayoutOpts {
  /** Big heading at the top of the card. */
  heading: string;
  /** Preheader (inbox preview text). */
  preview: string;
  /** Primary button. */
  cta?: { label: string; url: string };
  /** Footer unsubscribe link, for non-essential mail only. */
  unsubscribeUrl?: string;
}

const BRAND_A = "#5aa6ff";
const BRAND_B = "#1566e6";

/** Wrap body HTML in the branded Sentrive shell. Inline styles only (email). */
export function layout(bodyHtml: string, opts: LayoutOpts): string {
  const button = opts.cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${opts.cta.url}" style="display:inline-block;background:linear-gradient(135deg,${BRAND_A},${BRAND_B});color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">${opts.cta.label}</a>
       </td></tr>`
    : "";
  const unsub = opts.unsubscribeUrl
    ? `<br/>Don't want these? <a href="${opts.unsubscribeUrl}" style="color:#8a94a6;">Unsubscribe</a>.`
    : "";
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f7fb;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preview}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(20,40,80,0.06);">
        <tr><td style="height:6px;background:linear-gradient(90deg,${BRAND_A},${BRAND_B});"></td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-size:15px;font-weight:700;color:${BRAND_B};letter-spacing:-0.2px;">Sentrive</div>
        </td></tr>
        <tr><td style="padding:8px 32px 4px;">
          <h1 style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:1.25;font-weight:800;color:#101828;letter-spacing:-0.4px;">${opts.heading}</h1>
        </td></tr>
        <tr><td style="padding:12px 32px 4px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#475467;">
          <table role="presentation" cellpadding="0" cellspacing="0">${bodyHtml}${button}</table>
        </td></tr>
        <tr><td style="padding:24px 32px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#8a94a6;border-top:1px solid #eef1f6;">
          Sentrive, your AI marketing employee.${unsub}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
