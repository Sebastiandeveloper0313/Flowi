// Sentrive - scheduler. Invoked every minute by pg_cron.
// Finds active recurring tasks that are due, runs them, and advances next_run_at.
// Protected by the service-role key (fail closed): only the cron job can call it.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Cron } from "npm:croner@9";

import { dripAutoPosts } from "../_shared/auto-post.ts";
import { sweepDailyDigest, sweepLifecycleEmails } from "../_shared/lifecycle-emails.ts";
import { dripQueuedPosts } from "../_shared/reddit-post.ts";
import { runTaskOnce, type TaskRow } from "../_shared/runner.ts";

const BATCH = 100; // tasks processed per invocation; the rest catch the next minute

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Next scheduled time strictly after `from`, in the task's timezone. Null if invalid. */
function nextRun(cron: string, timezone: string, from: Date): Date | null {
  try {
    return new Cron(cron, { timezone: timezone || "UTC" }).nextRun(from);
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  // Accept a dedicated scheduler secret (set per environment and mirrored in
  // the Vault secret the cron dispatcher sends), falling back to the service
  // role key for local dev. Fail closed either way. FLOWY_SCHEDULER_SECRET is
  // the legacy name, still honored so a rename never breaks a running prod.
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const schedulerSecret =
    Deno.env.get("SENTRIVE_SCHEDULER_SECRET") ?? Deno.env.get("FLOWY_SCHEDULER_SECRET");
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = !!token && (token === service || (!!schedulerSecret && token === schedulerSecret));
  if (!ok) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, service);
  const now = new Date();
  const nowIso = now.toISOString();

  // Reap orphaned runs: a run stuck in 'running' well past the runner's own
  // timeout means the function was killed before it could finish. Fail it so it
  // stops showing "Running..." forever AND stops blocking the agent's next run
  // (runTaskOnce refuses to start while a run is in progress).
  const reapCutoff = new Date(now.getTime() - 4 * 60_000).toISOString();
  await admin
    .from("task_runs")
    .update({ status: "failed", error: "Run timed out.", finished_at: nowIso })
    .eq("status", "running")
    .lt("started_at", reapCutoff);

  // Only active recurring tasks that are due now or not yet scheduled.
  const { data: tasks, error } = await admin
    .from("tasks")
    .select(
      "id, team_id, created_by, title, instructions, channel, schedule_cron, timezone, status, kind, config, autonomy_mode, next_run_at",
    )
    .eq("status", "active")
    .not("schedule_cron", "is", null)
    .or(`next_run_at.lte.${nowIso},next_run_at.is.null`)
    .order("next_run_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);

  if (error) return json({ error: error.message }, 500);

  // Only run agents for paying accounts. Trialing/past_due both keep plan='pro',
  // and 'internal' is staff. Free and canceled accounts are already blocked from
  // the app by the paywall, but their agents would otherwise keep firing on cron
  // forever — that's the bulk of our API spend (most runs come from non-payers).
  // We still advance next_run_at above, so an agent resumes automatically the
  // moment its owner subscribes again. Entitlement is account-level: a user's
  // subscription lives on their primary team, so anyone who owns a pro/internal
  // team is entitled across all their workspaces.
  const { data: proOwners } = await admin
    .from("teams")
    .select("created_by")
    .in("plan", ["pro", "internal"]);
  const entitledOwners = new Set((proOwners ?? []).map((t) => t.created_by));

  let ran = 0;
  let initialized = 0;
  let failed = 0;
  let skipped = 0;

  for (const task of (tasks ?? []) as (TaskRow & {
    next_run_at: string | null;
    created_by: string;
  })[]) {
    const next = nextRun(task.schedule_cron!, task.timezone, now);

    // Claim the task by advancing next_run_at BEFORE running, so an overlapping
    // invocation can't dispatch it twice. A bad cron expression parks it (null).
    await admin
      .from("tasks")
      .update({ next_run_at: next ? next.toISOString() : null })
      .eq("id", task.id);

    // First time we see a task (no next_run_at yet): just schedule it, don't run.
    if (task.next_run_at === null) {
      initialized++;
      continue;
    }

    // Paywall the scheduler: never spend API credits running a non-paying
    // account's agents. next_run_at is already advanced, so it resumes on the
    // next tick once the owner has an active plan again.
    if (!entitledOwners.has(task.created_by)) {
      skipped++;
      continue;
    }

    const result = await runTaskOnce(admin, task);
    if (result.status === "succeeded") ran++;
    else if (result.status === "failed") failed++;
  }

  // Drain any Reddit auto-posts that are due (auto mode). Dripped one per team
  // per tick so they never burst, even when several fall due at once.
  const drip = await dripAutoPosts(admin).catch(() => ({ posted: 0, failed: 0, due: 0 }));

  // Drain queued Reddit community posts (auto-mode posters), also one per team
  // per tick, so the staggered cancel-window schedule actually goes out.
  const postDrip = await dripQueuedPosts(admin).catch(() => ({ posted: 0, failed: 0, due: 0 }));

  // Time-based lifecycle email (onboarding nudge, win-back) only needs an hourly
  // pass, so run it at the top of the hour. Sends are deduped, so even if a tick
  // is missed the next hour catches up without double-sending.
  let emails: { onboarding: number; winback: number } | undefined;
  if (now.getUTCMinutes() === 0) {
    emails = await sweepLifecycleEmails(admin).catch(() => ({ onboarding: 0, winback: 0 }));
  }

  // Daily agent-activity digest: once a day at 14:00 UTC (mid-morning US, early
  // afternoon EU). Deduped per user per day, so the exact minute only needs to be
  // hit once. This is how results reach users who don't log in to the dashboard.
  let digest: { digests: number } | undefined;
  if (now.getUTCHours() === 14 && now.getUTCMinutes() === 0) {
    digest = await sweepDailyDigest(admin).catch(() => ({ digests: 0 }));
  }

  return json({
    checked: tasks?.length ?? 0,
    ran,
    initialized,
    failed,
    skipped,
    drip,
    postDrip,
    emails,
    digest,
    at: nowIso,
  });
});
