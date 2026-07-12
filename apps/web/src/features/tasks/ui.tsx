import { Badge } from "@workspace/ui/components/badge";
import { Inbox, Mail } from "lucide-react";

/**
 * Where an agent's result lands. Results always show up in the dashboard; email
 * is an extra copy. Shown as a small icon + label on agent cards.
 */
export function DeliveryChip({ channel }: { channel: string }) {
  const email = channel === "email";
  return (
    <span className="flex items-center gap-1.5">
      {email ? <Mail className="size-3.5" /> : <Inbox className="size-3.5" />}
      {email ? "Emailed to you" : "In your dashboard"}
    </span>
  );
}

/** Active / Paused / Draft pill for a task's status. */
export function TaskStatusBadge({ status }: { status: string }) {
  if (status === "paused") return <Badge variant="secondary">Paused</Badge>;
  if (status === "draft") return <Badge variant="outline">Draft</Badge>;
  return <Badge>Active</Badge>;
}

/** Colored dot for a run's status. */
export function RunDot({ status }: { status: string }) {
  const cls =
    status === "succeeded"
      ? "bg-green-500"
      : status === "failed"
        ? "bg-destructive"
        : status === "running"
          ? "bg-amber-500 animate-pulse"
          : "bg-slate-300";
  return <span className={`inline-block size-2 shrink-0 rounded-full ${cls}`} />;
}

export function runStatusLabel(status: string): string {
  return status === "succeeded"
    ? "Succeeded"
    : status === "failed"
      ? "Failed"
      : status === "running"
        ? "Running"
        : "Queued";
}

/** Strip inline markdown so a one-line summary reads clean (no **stars**, `ticks`, #, >). */
function stripInlineMarkdown(s: string): string {
  return s
    .replace(/\*\*/g, "")
    .replace(/`+/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .trim();
}

/**
 * Turn a raw run error into a calm, readable line for the user. Hides internal
 * or vendor noise (raw API JSON, our own credit/billing state) behind a neutral
 * "temporary error, it'll retry" message, and keeps the errors that are actually
 * actionable by the user (a banned subreddit, a missing connection).
 */
export function humanizeRunError(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "This run didn't finish. It will try again on its next schedule.";
  if (/credit balance is too low|insufficient\s+credits?|rate.?limit|overloaded|429|5\d\d/i.test(s))
    return "This run hit a temporary limit and didn't finish. It will run again automatically.";
  if (/SUBREDDIT_NOTALLOWED_BANNED|banned from (contributing|participating)/i.test(s))
    return "Your Reddit account is banned from that subreddit, so this couldn't post. Remove it from the agent's targets, or let Sentrive pick subreddits.";
  if (/not connected|connect .* on the integrations/i.test(s)) return s;
  const msg = s.match(/"message"\s*:\s*"([^"]+)"/)?.[1];
  const cleaned = (msg ?? s).replace(/^Claude(?: API)? error \d+:\s*/i, "").trim();
  if (!cleaned || cleaned.startsWith("{") || cleaned.startsWith("["))
    return "This run didn't finish because of a temporary error. It will try again automatically.";
  return cleaned.length > 240 ? `${cleaned.slice(0, 240)}…` : cleaned;
}

/** The one-line summary shown in run lists: humanized on failure, de-marked otherwise. */
export function runSummaryLine(run: {
  status: string;
  summary?: string | null;
  error?: string | null;
}): string {
  if (run.status === "failed") return humanizeRunError(run.summary ?? run.error);
  const base = (run.summary ?? run.error ?? runStatusLabel(run.status)).trim();
  return stripInlineMarkdown(base) || runStatusLabel(run.status);
}
