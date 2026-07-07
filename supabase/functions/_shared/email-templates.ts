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
