import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Check, CheckCheck, Loader2, Sparkles } from "lucide-react";

import { useConfirm } from "@/components/useConfirm";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { formatWhen, useTasks } from "@/features/tasks/hooks";

import { useApprovals, useDecideApproval } from "./hooks";
import type { Approval } from "./queries";

/**
 * "Waiting for you" on the main page: the top few things blocked on the user's
 * yes, approvable right here so results don't sit in a page nobody visits.
 * Renders nothing when the user is caught up; editing happens on /approvals.
 */
export function WaitingStrip() {
  const { data: approvals } = useApprovals();
  const { data: leadGroups } = usePendingLeadReplies();
  const { data: tasks } = useTasks();

  const pending = (approvals ?? []).filter((a) => a.status === "pending");
  const replyGroups = leadGroups ?? [];
  const total = pending.length + replyGroups.reduce((s, g) => s + g.count, 0);
  if (total === 0) return null;

  const titleById = new Map((tasks ?? []).map((t) => [t.id, t.title]));

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CheckCheck className="text-primary size-4" /> Waiting for you
          <span className="text-primary">· {total}</span>
        </h2>
        <Link to="/approvals" className="text-primary text-sm font-medium hover:underline">
          See all
        </Link>
      </div>

      <div className="grid gap-2">
        {replyGroups.map((g) => (
          <Link
            key={g.taskId}
            to="/agents/$agentId"
            params={{ agentId: g.taskId }}
            className="bg-card hover:border-primary/40 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                <Sparkles className="size-3.5 shrink-0" />
                {titleById.get(g.taskId) ?? "Reddit leads"}
              </p>
              <p className="text-muted-foreground text-xs">
                {g.count} repl{g.count === 1 ? "y" : "ies"} drafted, ready to review and post
              </p>
            </div>
            <span className="text-primary shrink-0 text-sm font-medium">Review</span>
          </Link>
        ))}
        {pending.slice(0, 2).map((a) => (
          <WaitingRow key={a.id} approval={a} />
        ))}
        {pending.length > 2 && (
          <Link
            to="/approvals"
            className="text-muted-foreground hover:text-foreground py-1 text-center text-sm"
          >
            + {pending.length - 2} more waiting
          </Link>
        )}
      </div>
    </section>
  );
}

/** One pending approval: approve here (same confirm as /approvals) or edit there. */
function WaitingRow({ approval: a }: { approval: Approval }) {
  const decide = useDecideApproval();
  const { confirm, dialog } = useConfirm();
  const busy = decide.isPending && decide.variables?.id === a.id;

  async function onApprove() {
    const ok = await confirm({
      title: "Approve and do it now?",
      description: `This will ${a.title.toLowerCase()} immediately from your connected account. It can't be undone here.`,
      confirmLabel: "Approve",
    });
    if (ok) decide.mutate({ id: a.id, decision: "approve" });
  }

  return (
    <div className="bg-card flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{a.title}</p>
        <p className="text-muted-foreground truncate text-xs">
          {a.agent_title ?? "From chat"} · {formatWhen(a.created_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-8" asChild>
          <Link to="/approvals">Edit</Link>
        </Button>
        <Button size="sm" className="h-8" disabled={busy} onClick={() => void onApprove()}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Approve
        </Button>
      </div>
      {dialog}
    </div>
  );
}
