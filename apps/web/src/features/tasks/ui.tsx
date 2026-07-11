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
