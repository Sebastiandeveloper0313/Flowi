// The lifecycle email templates. Each returns { subject, html, text } and
// composes the shared branded layout. Copy is short, plainspoken, and never
// uses em dashes. Non-essential mail (onboarding nudge, win-back) carries an
// unsubscribe link; the cancel confirmation is transactional and does not.
import { appUrl, layout } from "./email.ts";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function p(text: string): string {
  return `<tr><td style="padding:0 0 14px;">${text}</td></tr>`;
}

function firstName(full?: string | null): string {
  const n = (full ?? "").trim().split(/\s+/)[0];
  return n && n.length <= 24 ? n : "there";
}

/** Signed up but never finished setup. Pull them back to first value. */
export function finishOnboardingEmail(opts: {
  fullName?: string | null;
  unsubscribeUrl: string;
}): RenderedEmail {
  const url = `${appUrl()}/dashboard`;
  const hi = firstName(opts.fullName);
  const subject = "Your Sentrive is set up but not running yet";
  const html = layout(
    p(
      `Hi ${hi}, you created a Sentrive account but haven't finished setting it up, so nothing is running for you yet.`,
    ) +
      p(
        `It takes about two minutes: point Sentrive at your website and connect Reddit, and it starts finding people describing the exact problem you solve and drafting replies you can send.`,
      ) +
      p(`Your account is ready when you are.`),
    {
      heading: "Let's get your first leads",
      preview: "You're two minutes from your first leads.",
      cta: { label: "Finish setup", url },
      unsubscribeUrl: opts.unsubscribeUrl,
    },
  );
  const text = `Hi ${hi}, you created a Sentrive account but haven't finished setting it up, so nothing is running for you yet.

It takes about two minutes: point Sentrive at your website and connect Reddit, and it starts finding people describing the exact problem you solve and drafting replies you can send.

Finish setup: ${url}

Unsubscribe: ${opts.unsubscribeUrl}`;
  return { subject, html, text };
}

/** Confirm a cancellation that's set to take effect at period end. Transactional. */
export function cancelConfirmEmail(opts: {
  fullName?: string | null;
  endDate: string;
}): RenderedEmail {
  const url = `${appUrl()}/settings`;
  const hi = firstName(opts.fullName);
  const subject = `Your Sentrive plan ends ${opts.endDate}`;
  const html = layout(
    p(
      `Hi ${hi}, we've scheduled your Sentrive subscription to end on <strong style="color:#101828;">${opts.endDate}</strong>.`,
    ) +
      p(
        `Everything keeps working until then, and your agents' setups are saved, so nothing is lost. If you change your mind, you can resume in one click any time before then and pick up right where you left off.`,
      ) +
      p(`Thanks for giving Sentrive a run.`),
    {
      heading: `Your plan ends ${opts.endDate}`,
      preview: `Your plan stays active until ${opts.endDate}.`,
      cta: { label: "Resume my plan", url },
    },
  );
  const text = `Hi ${hi}, we've scheduled your Sentrive subscription to end on ${opts.endDate}.

Everything keeps working until then, and your agents' setups are saved, so nothing is lost. If you change your mind, you can resume any time before then and pick up right where you left off.

Resume your plan: ${url}`;
  return { subject, html, text };
}

/**
 * The daily agent-activity digest. Tells the user what their agents did in the
 * last day and pulls them back in to act on drafted replies (or switch to auto),
 * which is where most of the value actually gets delivered. Non-essential, so it
 * carries an unsubscribe link.
 */
export function dailyDigestEmail(opts: {
  fullName?: string | null;
  newLeads: number;
  pending: number;
  posted: number;
  unsubscribeUrl: string;
}): RenderedEmail {
  const url = `${appUrl()}/dashboard`;
  const hi = firstName(opts.fullName);
  const { newLeads, pending, posted } = opts;
  const b = (n: number) => `<strong style="color:#101828;">${n}</strong>`;

  const found: string[] = [];
  if (newLeads > 0) found.push(`${b(newLeads)} new lead${newLeads === 1 ? "" : "s"} found`);
  if (posted > 0) found.push(`${b(posted)} repl${posted === 1 ? "y" : "ies"} posted for you`);

  let body = p(`Hi ${hi}, quick report from your team on the last day.`);
  if (found.length) body += p(`${found.join(", ")}.`);
  if (pending > 0) {
    body += p(
      `${b(pending)} drafted repl${pending === 1 ? "y is" : "ies are"} waiting for you to review and post.`,
    );
    body += p(
      `Tired of approving each one? Switch an agent to auto and Sentrive posts them for you, spaced out safely.`,
    );
  }

  const subject =
    posted > 0
      ? `Sentrive posted ${posted} repl${posted === 1 ? "y" : "ies"} for you`
      : pending > 0
        ? `${pending} repl${pending === 1 ? "y" : "ies"} ready for you to post`
        : `${newLeads} new lead${newLeads === 1 ? "" : "s"} from your agents`;

  const html = layout(body, {
    heading: "Your team's daily report",
    preview: subject,
    cta: { label: pending > 0 ? "Review and post" : "See your results", url },
    unsubscribeUrl: opts.unsubscribeUrl,
  });

  const text = `Hi ${hi}, here is what your Sentrive agents did in the last day.
${newLeads > 0 ? `\n- ${newLeads} new leads found` : ""}${posted > 0 ? `\n- ${posted} replies posted for you` : ""}${pending > 0 ? `\n- ${pending} drafted replies waiting for you to review and post` : ""}

${pending > 0 ? "Review and post: " : "See your results: "}${url}

Unsubscribe: ${opts.unsubscribeUrl}`;
  return { subject, html, text };
}

/** A week or so after a plan lapsed. Warm, low-pressure, door held open. */
export function winBackEmail(opts: {
  fullName?: string | null;
  unsubscribeUrl: string;
}): RenderedEmail {
  const url = `${appUrl()}/settings`;
  const hi = firstName(opts.fullName);
  const subject = "Your Sentrive agents have gone quiet";
  const html = layout(
    p(
      `Hi ${hi}, your Sentrive plan lapsed a little while ago, so your agents have stopped looking for leads for you.`,
    ) +
      p(
        `They kept their setups, so turning them back on picks up exactly where you left off, no reconfiguring. If cost was the reason you left, just reply to this email and we'll sort out a deal to get you back.`,
      ) +
      p(`Either way, no hard feelings.`),
    {
      heading: "Want your agents back?",
      preview: "Turn your agents back on, right where you left off.",
      cta: { label: "Reactivate Sentrive", url },
      unsubscribeUrl: opts.unsubscribeUrl,
    },
  );
  const text = `Hi ${hi}, your Sentrive plan lapsed a little while ago, so your agents have stopped looking for leads for you.

They kept their setups, so turning them back on picks up exactly where you left off. If cost was the reason you left, just reply to this email and we'll sort out a deal to get you back.

Reactivate: ${url}

Unsubscribe: ${opts.unsubscribeUrl}`;
  return { subject, html, text };
}
