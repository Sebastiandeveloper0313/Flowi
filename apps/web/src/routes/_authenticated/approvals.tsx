import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Loader2,
  MessageSquare,
  Sparkles,
  X,
} from "lucide-react";

import { useApprovals, useDecideApproval } from "@/features/approvals/hooks";
import type { Approval } from "@/features/approvals/queries";
import { PageHeader } from "@/features/dashboard/ui";
import { formatWhen } from "@/features/tasks/hooks";

export const Route = createFileRoute("/_authenticated/approvals")({
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { data: approvals, isLoading } = useApprovals();
  const decide = useDecideApproval();

  const pending = (approvals ?? []).filter((a) => a.status === "pending");
  const decided = (approvals ?? []).filter((a) => a.status !== "pending").slice(0, 20);

  return (
    <div className="flowy-page">
      <PageHeader
        title="Approvals"
        subtitle="Nothing happens behind your back. Anything an agent needs a yes for waits here."
      />

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-16 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading approvals…
        </div>
      ) : pending.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCheck className="size-6" />
            </span>
            <p className="font-medium">You're all caught up</p>
            <p className="text-muted-foreground text-sm">No agents are waiting on your approval.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pending.map((a) => {
            const busy = decide.isPending && decide.variables?.id === a.id;
            const failed =
              decide.isError && (decide.variables as { id?: string } | undefined)?.id === a.id;
            return (
              <Card key={a.id}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <SourceLabel approval={a} />
                    <span className="text-muted-foreground text-xs">
                      {formatWhen(a.created_at)}
                    </span>
                  </div>
                  <h3 className="mt-1.5 font-semibold">{a.title}</h3>
                  {a.detail ? (
                    <p className="text-muted-foreground mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                      {a.detail}
                    </p>
                  ) : null}

                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => decide.mutate({ id: a.id, decision: "approve" })}
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => decide.mutate({ id: a.id, decision: "reject" })}
                    >
                      <X className="size-4" /> Reject
                    </Button>
                  </div>

                  {failed && (
                    <p className="text-destructive mt-3 flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="size-3.5" />
                      {(decide.error as Error)?.message || "Could not complete that. Try again."}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {decided.length > 0 && (
        <section className="mt-10">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
            Recently decided
          </h2>
          <div className="grid gap-2">
            {decided.map((a) => (
              <div
                key={a.id}
                className="bg-card/60 flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {formatWhen(a.decided_at)}
                  </p>
                </div>
                <DecisionBadge status={a.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SourceLabel({ approval }: { approval: Approval }) {
  if (approval.source === "chat") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
        <MessageSquare className="size-3.5" /> From chat
      </span>
    );
  }
  const label = (
    <span className="flex items-center gap-1.5">
      <Sparkles className="size-3.5" /> {approval.agent_title ?? "An agent"}
    </span>
  );
  return approval.task_id ? (
    <Link
      to="/agents/$agentId"
      params={{ agentId: approval.task_id }}
      className="hover:text-primary text-sm font-medium"
    >
      {label}
    </Link>
  ) : (
    <span className="text-sm font-medium">{label}</span>
  );
}

function DecisionBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    executed: { label: "Done", cls: "bg-emerald-50 text-emerald-700" },
    rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-700" },
    failed: { label: "Failed", cls: "bg-amber-50 text-amber-700" },
    approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}
