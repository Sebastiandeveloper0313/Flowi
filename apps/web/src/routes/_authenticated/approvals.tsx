import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Loader2,
  MessageSquare,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";

import { useConfirm } from "@/components/useConfirm";
import { useApprovals, useDecideApproval } from "@/features/approvals/hooks";
import type { Approval } from "@/features/approvals/queries";
import { PageHeader } from "@/features/dashboard/ui";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { formatWhen, useTasks } from "@/features/tasks/hooks";

export const Route = createFileRoute("/_authenticated/approvals")({
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { data: approvals, isLoading } = useApprovals();
  const { data: leadGroups } = usePendingLeadReplies();
  const { data: tasks } = useTasks();
  const decide = useDecideApproval();
  const { confirm, dialog } = useConfirm();

  // Approve does the outside-world action (send/post) immediately, and reject
  // discards it for good - both irreversible, so both confirm first. `editedText`
  // carries any changes the user made to the post/reply before approving.
  async function onDecide(a: Approval, decision: "approve" | "reject", editedText?: string) {
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
    if (ok) decide.mutate({ id: a.id, decision, editedText });
  }

  const pending = (approvals ?? []).filter((a) => a.status === "pending");
  const decided = (approvals ?? []).filter((a) => a.status !== "pending").slice(0, 20);
  const replyGroups = leadGroups ?? [];
  const replyTotal = replyGroups.reduce((s, g) => s + g.count, 0);
  const caughtUp = pending.length === 0 && replyTotal === 0;

  return (
    <div className="flowy-page">
      <PageHeader
        title="Approvals"
        subtitle="Nothing happens behind your back. Anything an agent needs a yes for waits here."
      />

      {/* Reddit reply drafts are approval-shaped: they only post when you click.
          Surface them here (with a link to review in context) so this page
          honestly reflects everything waiting on you. */}
      {replyTotal > 0 && (
        <section className="mb-8">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
            Replies to review
          </h2>
          <div className="grid gap-2">
            {replyGroups.map((g) => {
              const title = tasks?.find((t) => t.id === g.taskId)?.title ?? "Reddit agent";
              return (
                <Link
                  key={g.taskId}
                  to="/agents/$agentId"
                  params={{ agentId: g.taskId }}
                  className="bg-card hover:border-primary/40 flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <Sparkles className="size-3.5 shrink-0" /> {title}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {g.count} repl{g.count === 1 ? "y" : "ies"} drafted, waiting for you to review
                      and post
                    </p>
                  </div>
                  <span className="text-primary shrink-0 text-sm font-medium">Review</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-16 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading approvals…
        </div>
      ) : caughtUp ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCheck className="size-6" />
            </span>
            <p className="font-medium">You're all caught up</p>
            <p className="text-muted-foreground text-sm">No agents are waiting on your approval.</p>
          </CardContent>
        </Card>
      ) : pending.length === 0 ? null : (
        <div className="grid gap-4">
          {pending.map((a) => {
            const busy = decide.isPending && decide.variables?.id === a.id;
            const failed =
              decide.isError && (decide.variables as { id?: string } | undefined)?.id === a.id;
            return (
              <ApprovalCard
                key={a.id}
                approval={a}
                busy={busy}
                errorMsg={
                  failed
                    ? (decide.error as Error)?.message || "Could not complete that. Try again."
                    : null
                }
                onDecide={onDecide}
              />
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
            {decided.map((a) => {
              const reason =
                a.status === "failed" && typeof a.result === "string" ? a.result : null;
              return (
                <div
                  key={a.id}
                  className="bg-card/60 flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {reason ? reason : formatWhen(a.decided_at)}
                    </p>
                  </div>
                  <DecisionBadge status={a.status} />
                </div>
              );
            })}
          </div>
        </section>
      )}
      {dialog}
    </div>
  );
}

// Ordered candidate fields holding the editable body of each write action,
// mirroring the backend's content-field map. A slug that isn't here isn't
// inline-editable, so we show its read-only preview instead.
const CONTENT_FIELDS: Record<string, string[]> = {
  LINKEDIN_CREATE_LINKED_IN_POST: ["commentary", "text"],
  FACEBOOK_CREATE_POST: ["message"],
  FACEBOOK_CREATE_COMMENT: ["message", "comment"],
  FACEBOOK_SEND_MESSAGE: ["message", "text"],
  GMAIL_SEND_EMAIL: ["body", "message_body", "message"],
  GMAIL_REPLY_TO_THREAD: ["message_body", "body", "message"],
  REDDIT_POST_REDDIT_COMMENT: ["text", "body"],
};

function editableContent(a: Approval): string | null {
  const args = (a.tool_args ?? {}) as Record<string, unknown>;
  for (const f of CONTENT_FIELDS[a.tool_slug] ?? []) {
    if (typeof args[f] === "string") return args[f] as string;
  }
  return null;
}

/** One pending approval, with the post/reply editable inline before you approve it. */
function ApprovalCard({
  approval: a,
  busy,
  errorMsg,
  onDecide,
}: {
  approval: Approval;
  busy: boolean;
  errorMsg: string | null;
  onDecide: (a: Approval, decision: "approve" | "reject", editedText?: string) => void;
}) {
  const original = editableContent(a);
  const [text, setText] = useState(original ?? "");
  const subject = a.tool_slug.startsWith("GMAIL_")
    ? (((a.tool_args ?? {}) as { subject?: unknown }).subject as string | undefined)
    : undefined;
  const edited = original !== null && text.trim() !== original.trim();

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <SourceLabel approval={a} />
          <span className="text-muted-foreground text-xs">{formatWhen(a.created_at)}</span>
        </div>
        <h3 className="mt-1.5 font-semibold">{a.title}</h3>

        {original !== null ? (
          <div className="mt-2">
            {subject ? (
              <p className="text-muted-foreground mb-1.5 text-xs">
                Subject: <span className="text-foreground">{subject}</span>
              </p>
            ) : null}
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(14, Math.max(4, text.split("\n").length + 1))}
              className="resize-y text-sm leading-relaxed"
              placeholder="Write the message…"
            />
            <p className="text-muted-foreground mt-1.5 text-xs">
              {edited
                ? "Edited. Your version is what goes out."
                : "Edit this before you approve it."}
            </p>
          </div>
        ) : a.detail ? (
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed whitespace-pre-wrap">
            {a.detail}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            disabled={busy || (original !== null && !text.trim())}
            onClick={() => onDecide(a, "approve", edited ? text : undefined)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide(a, "reject")}>
            <X className="size-4" /> Reject
          </Button>
        </div>

        {errorMsg && (
          <p className="text-destructive mt-3 flex items-center gap-1.5 text-xs">
            <AlertTriangle className="size-3.5" />
            {errorMsg}
          </p>
        )}
      </CardContent>
    </Card>
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
