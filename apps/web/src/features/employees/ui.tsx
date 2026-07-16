import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Check, Loader2, X } from "lucide-react";

import { useConfirm } from "@/components/useConfirm";
import { useDecideApproval } from "@/features/approvals/hooks";
import type { Approval } from "@/features/approvals/queries";
import { formatWhen, scheduleLabel } from "@/features/tasks/hooks";
import type { Task, TaskRun } from "@/features/tasks/queries";
import { RunDot, runSummaryLine, TaskStatusBadge } from "@/features/tasks/ui";

/** One line of an employee's feed: what it did, when, click for the details. */
export function FeedRow({ run, title }: { run: TaskRun; title: string }) {
  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: run.task_id }}
      className="hover:bg-muted/40 flex items-center gap-3 rounded-lg px-2 py-2.5 transition"
    >
      <RunDot status={run.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-muted-foreground truncate text-xs">{runSummaryLine(run)}</p>
      </div>
      <span className="text-muted-foreground shrink-0 text-xs">{formatWhen(run.created_at)}</span>
    </Link>
  );
}

/** One of the employee's duties (an agent), linking to its settings page. */
export function DutyRow({ task }: { task: Task }) {
  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: task.id }}
      className="bg-muted/30 hover:border-primary/40 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 transition"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="text-muted-foreground text-xs">{scheduleLabel(task.schedule_cron)}</p>
      </div>
      <TaskStatusBadge status={task.status} />
    </Link>
  );
}

/** A small labeled number on an employee card or page header. */
export function StatChip({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="bg-muted/40 rounded-xl px-3 py-2">
      <p className="text-lg leading-tight font-bold">{value ?? "…"}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

/**
 * A pending approval as one inbox row: approve or reject right here (same
 * confirm dialogs as the Inbox page); click the text to edit it there first.
 */
export function InboxApprovalRow({ approval: a }: { approval: Approval }) {
  const decide = useDecideApproval();
  const { confirm, dialog } = useConfirm();
  const busy = decide.isPending && decide.variables?.id === a.id;

  async function onDecide(decision: "approve" | "reject") {
    const ok =
      decision === "approve"
        ? await confirm({
            title: "Approve and do it now?",
            description: `This will ${a.title.toLowerCase()} immediately from your connected account. It can't be undone here.`,
            confirmLabel: "Approve",
          })
        : await confirm({
            title: "Reject this?",
            description: "The agent won't take this action, and it won't be retried.",
            confirmLabel: "Reject",
            destructive: true,
          });
    if (ok) decide.mutate({ id: a.id, decision });
  }

  return (
    <div className="bg-muted/30 flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <Link to="/approvals" className="group min-w-0">
        <p className="group-hover:text-primary truncate text-sm font-medium">{a.title}</p>
        <p className="text-muted-foreground truncate text-xs">
          {a.agent_title ?? "From chat"} · {formatWhen(a.created_at)}
        </p>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" className="h-8" disabled={busy} onClick={() => void onDecide("approve")}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground h-8"
          disabled={busy}
          onClick={() => void onDecide("reject")}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {dialog}
    </div>
  );
}
