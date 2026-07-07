// Lifecycle email orchestration. Two entry points:
//   sweepLifecycleEmails(admin)  - time-based mail, run hourly by the scheduler
//     (onboarding nudge, win-back), driven by the SQL candidate functions.
//   sendCancelConfirmation(...)  - event-based, called by the Stripe webhook the
//     moment a cancellation is scheduled.
// Every send is claimed in email_log FIRST (unique on kind+dedupe_key), so an
// overlapping sweep or a retrying webhook can never double-send; a failed send
// releases the claim so it retries later.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { cancelConfirmEmail, finishOnboardingEmail, winBackEmail } from "./email-templates.ts";
import { sendEmail } from "./email.ts";

function unsubscribeUrl(token: string): string {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  return `${base}/functions/v1/unsubscribe?token=${token}`;
}

/** Get (creating if needed) this user's unsubscribe token, or null if opted out. */
async function optoutToken(admin: SupabaseClient, userId: string): Promise<string | null> {
  await admin
    .from("email_optout")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data } = await admin
    .from("email_optout")
    .select("token, opted_out_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.opted_out_at) return null;
  return data.token as string;
}

/**
 * Claim a send in email_log then run it. Returns true if sent. If the claim
 * conflicts (already sent) we skip; if the send fails we release the claim so a
 * later run retries.
 */
async function claimAndSend(
  admin: SupabaseClient,
  claim: {
    userId: string | null;
    teamId: string | null;
    kind: string;
    dedupeKey: string;
    to: string;
  },
  render: () => { subject: string; html: string; text: string },
): Promise<boolean> {
  const { error: claimErr } = await admin.from("email_log").insert({
    user_id: claim.userId,
    team_id: claim.teamId,
    kind: claim.kind,
    dedupe_key: claim.dedupeKey,
    to_email: claim.to,
  });
  if (claimErr) return false; // unique violation => already handled, or insert error

  const email = render();
  const res = await sendEmail({ to: claim.to, ...email });
  if (!res.ok) {
    // release the claim so we can retry on a later run
    await admin.from("email_log").delete().eq("kind", claim.kind).eq("dedupe_key", claim.dedupeKey);
    console.error(`lifecycle email ${claim.kind} failed:`, res.error);
    return false;
  }
  await admin
    .from("email_log")
    .update({ provider_id: res.id })
    .eq("kind", claim.kind)
    .eq("dedupe_key", claim.dedupeKey);
  return true;
}

interface OnboardingRow {
  user_id: string;
  email: string;
  team_id: string | null;
  full_name: string | null;
}
interface WinbackRow {
  user_id: string;
  email: string;
  team_id: string;
  subscription_id: string | null;
  full_name: string | null;
}

/** Run the hourly time-based lifecycle sends. Returns a small summary. */
export async function sweepLifecycleEmails(
  admin: SupabaseClient,
): Promise<{ onboarding: number; winback: number }> {
  let onboarding = 0;
  let winback = 0;

  const { data: onb } = await admin.rpc("email_onboarding_candidates");
  for (const c of (onb ?? []) as OnboardingRow[]) {
    const token = await optoutToken(admin, c.user_id);
    if (!token) continue;
    const sent = await claimAndSend(
      admin,
      {
        userId: c.user_id,
        teamId: c.team_id,
        kind: "onboarding",
        dedupeKey: c.user_id,
        to: c.email,
      },
      () => finishOnboardingEmail({ fullName: c.full_name, unsubscribeUrl: unsubscribeUrl(token) }),
    );
    if (sent) onboarding++;
  }

  const { data: wb } = await admin.rpc("email_winback_candidates");
  for (const c of (wb ?? []) as WinbackRow[]) {
    const token = await optoutToken(admin, c.user_id);
    if (!token) continue;
    const sent = await claimAndSend(
      admin,
      { userId: c.user_id, teamId: c.team_id, kind: "winback", dedupeKey: c.team_id, to: c.email },
      () => winBackEmail({ fullName: c.full_name, unsubscribeUrl: unsubscribeUrl(token) }),
    );
    if (sent) winback++;
  }

  return { onboarding, winback };
}

/** Resolve a team's owner into an email + display name. */
async function teamOwnerContact(
  admin: SupabaseClient,
  teamId: string,
): Promise<{ userId: string; email: string; fullName: string | null } | null> {
  const { data: member } = await admin
    .from("team_members")
    .select("user_id, role")
    .eq("team_id", teamId)
    .order("role", { ascending: false }) // 'owner' sorts after 'admin'/'member'
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!member?.user_id) return null;
  const { data: u } = await admin.auth.admin.getUserById(member.user_id);
  const email = u?.user?.email;
  if (!email) return null;
  const { data: prof } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", member.user_id)
    .maybeSingle();
  return { userId: member.user_id, email, fullName: prof?.full_name ?? null };
}

/**
 * Send the cancellation confirmation for a team, once per subscription. Called
 * by the Stripe webhook when a cancel-at-period-end is first seen.
 */
export async function sendCancelConfirmation(
  admin: SupabaseClient,
  opts: { teamId: string; subscriptionId: string; periodEndUnix: number | null },
): Promise<boolean> {
  const owner = await teamOwnerContact(admin, opts.teamId);
  if (!owner) return false;
  const endDate = opts.periodEndUnix
    ? new Date(opts.periodEndUnix * 1000).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      })
    : "the end of your billing period";
  return claimAndSend(
    admin,
    {
      userId: owner.userId,
      teamId: opts.teamId,
      kind: "cancel",
      dedupeKey: opts.subscriptionId,
      to: owner.email,
    },
    () => cancelConfirmEmail({ fullName: owner.fullName, endDate }),
  );
}
