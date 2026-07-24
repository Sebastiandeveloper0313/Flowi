// The operations brief: what the whole workspace actually did, straight from
// the database. No integration, no web search, no guessing. The runner hands
// this block to the model as ground truth and the model writes it up, so the
// brief can never invent a number or a customer that does not exist.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface Row {
  [k: string]: unknown;
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" ? v : 0);

/** "3 leads" / "1 lead" */
function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Everything that happened in this workspace over the window, as plain text
 * facts. Deliberately verbose about what is WAITING, because that is the part
 * the operator has to act on.
 */
export async function operationsDigest(
  client: SupabaseClient,
  teamId: string,
  days: number,
): Promise<string> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const [tasks, runs, leads, drafts, approvals] = await Promise.all([
    client
      .from("tasks")
      .select("id, title, kind, status, next_run_at, schedule_cron")
      .eq("team_id", teamId)
      .limit(100),
    client
      .from("task_runs")
      .select("task_id, status, summary, error, created_at")
      .eq("team_id", teamId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    client
      .from("leads")
      .select("id, task_id, title, subreddit, status, draft_reply, created_at, updated_at")
      .eq("team_id", teamId)
      .gte("created_at", since)
      .limit(200),
    client
      .from("post_drafts")
      .select("id, task_id, title, status, updated_at, created_at")
      .eq("team_id", teamId)
      .gte("created_at", since)
      .limit(100),
    client
      .from("approvals")
      .select("id, title, status, created_at")
      .eq("team_id", teamId)
      .eq("status", "pending")
      .limit(50),
  ]);

  const taskRows = (tasks.data ?? []) as Row[];
  const runRows = (runs.data ?? []) as Row[];
  const leadRows = (leads.data ?? []) as Row[];
  const draftRows = (drafts.data ?? []) as Row[];
  const approvalRows = (approvals.data ?? []) as Row[];

  const titleById = new Map(taskRows.map((t) => [s(t.id), s(t.title) || "An agent"]));
  const window = days === 1 ? "the last 24 hours" : `the last ${days} days`;
  const lines: string[] = [`FACTS FOR ${window.toUpperCase()} (all figures are exact):`];

  // What ran.
  const ok = runRows.filter((r) => s(r.status) === "succeeded");
  const failed = runRows.filter((r) => s(r.status) === "failed");
  lines.push(
    `\nRUNS: ${plural(ok.length, "successful run")}, ${plural(failed.length, "failed run")}.`,
  );
  const byAgent = new Map<string, number>();
  for (const r of ok) byAgent.set(s(r.task_id), (byAgent.get(s(r.task_id)) ?? 0) + 1);
  for (const [id, count] of byAgent) {
    lines.push(`- ${titleById.get(id) ?? "An agent"}: ${plural(count, "run")}`);
  }
  for (const f of failed.slice(0, 5)) {
    lines.push(
      `- FAILED: ${titleById.get(s(f.task_id)) ?? "An agent"} - ${s(f.error) || s(f.summary) || "no reason recorded"}`,
    );
  }

  // What got produced.
  const newLeads = leadRows.length;
  const posted = leadRows.filter((l) => s(l.status) === "posted").length;
  const waitingLeads = leadRows.filter(
    (l) => s(l.status) === "new" && s(l.draft_reply).trim() !== "",
  );
  const published = draftRows.filter((d) => s(d.status) === "posted").length;
  const queued = draftRows.filter((d) => s(d.status) === "queued").length;
  const waitingDrafts = draftRows.filter(
    (d) => !["posted", "queued", "dismissed"].includes(s(d.status)),
  );
  lines.push(
    `\nOUTPUT: ${plural(newLeads, "new conversation")} found, ${plural(posted, "reply")} posted, ` +
      `${plural(published, "post")} published, ${plural(queued, "post")} queued to go out.`,
  );

  // What is waiting on the operator: the actionable half of the brief.
  const waitingTotal = waitingLeads.length + waitingDrafts.length + approvalRows.length;
  lines.push(`\nWAITING ON THE USER: ${waitingTotal} item${waitingTotal === 1 ? "" : "s"}.`);
  for (const l of waitingLeads.slice(0, 8)) {
    lines.push(
      `- Reply drafted for "${s(l.title).slice(0, 90)}"${l.subreddit ? ` in r/${s(l.subreddit)}` : ""}`,
    );
  }
  for (const d of waitingDrafts.slice(0, 8)) {
    lines.push(`- Post drafted: "${s(d.title).slice(0, 90)}"`);
  }
  for (const a of approvalRows.slice(0, 8)) {
    lines.push(`- Approval needed: ${s(a.title).slice(0, 90)}`);
  }
  if (waitingTotal === 0) lines.push("- Nothing. The user is fully caught up.");

  // What is coming, so the brief can end on the day ahead.
  const upcoming = taskRows
    .filter((t) => s(t.status) === "active" && s(t.next_run_at) && s(t.next_run_at) <= soon)
    .sort((a, b) => s(a.next_run_at).localeCompare(s(b.next_run_at)));
  lines.push(`\nDUE IN THE NEXT 24 HOURS: ${upcoming.length}.`);
  for (const t of upcoming.slice(0, 10)) {
    lines.push(`- ${s(t.title)} at ${s(t.next_run_at)}`);
  }

  const paused = taskRows.filter((t) => s(t.status) === "paused");
  if (paused.length > 0) {
    lines.push(
      `\nPAUSED AGENTS (${paused.length}): ${paused.map((t) => s(t.title)).join(", ")}. ` +
        "Mention these only if they have been paused a while and matter.",
    );
  }
  if (taskRows.length === 0) {
    lines.push("\nThis workspace has no agents at all yet, so there is nothing to report on.");
  }

  // Keep the block inside a sane prompt budget even for a busy workspace.
  const text = lines.join("\n");
  return text.length > 12000 ? `${text.slice(0, 12000)}\n[truncated]` : text;
}

/**
 * How far back a brief looks. Explicit config wins; otherwise the cadence
 * decides, because an agent that runs once a week is obviously reporting on
 * the week, and one that runs every weekday is reporting on the day.
 */
export function briefWindowDays(task: {
  config?: Record<string, unknown> | null;
  schedule_cron?: string | null;
}): number {
  const explicit = Number(task.config?.window_days);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 30) return Math.floor(explicit);
  const dow = (task.schedule_cron ?? "").trim().split(/\s+/)[4] ?? "";
  const weekly = dow !== "" && dow !== "*" && !dow.includes("-") && !dow.includes(",");
  return weekly ? 7 : 1;
}

/** The ops brief's own directive, appended to the runner system prompt. */
export function opsBriefSystem(days: number, facts: string): string {
  const window = days === 1 ? "since yesterday" : `over the last ${days} days`;
  return (
    `\n\nThis agent is the operations brief. Write the user's ${days === 1 ? "daily" : "weekly"} ` +
    `brief on how their Sentrive workspace is running ${window}.\n\n` +
    "Use ONLY the facts below. Every number must match them exactly. If a number is zero, say so " +
    "plainly rather than dressing it up, and never invent a lead, a post, a customer, or a result " +
    "that is not listed. You are reporting on work that already happened; do not use web search " +
    "and do not call any tool.\n\n" +
    "Structure it exactly like this, short enough to read in under a minute:\n" +
    "1. One opening line: how the operation is doing, in the user's terms.\n" +
    "2. **What got done** - the real output, as a few bullets. Skip anything that was zero.\n" +
    "3. **Needs you** - what is waiting on their approval, most valuable first, each one specific " +
    "enough to act on. If nothing is waiting, say they are caught up.\n" +
    "4. **Watch out** - only if something failed, is paused, or looks off. Say what to do about it. " +
    "Omit this section entirely when everything is fine.\n" +
    "5. **Next up** - what runs in the next 24 hours, in one line.\n\n" +
    "Write like a competent operations manager reporting to the founder: direct, specific, no " +
    "filler, no praise, no em dashes. Times are UTC in the facts; write them in plain language " +
    "(this morning, tonight) rather than repeating raw timestamps.\n\n" +
    facts
  );
}
