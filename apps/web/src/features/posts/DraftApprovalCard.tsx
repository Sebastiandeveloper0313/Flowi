import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { CalendarClock, Check, Loader2, Send, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { useConfirm } from "@/components/useConfirm";
import { ChatMarkdown } from "@/features/chat/Markdown";

import { usePublishPostDraft, useSchedulePostDraft, useSetPostDraftStatus } from "./hooks";
import { draftResults, type PostDraft } from "./queries";

/**
 * A post an agent wrote, waiting on a yes. On Ask first nothing here goes out
 * on its own, so this card is the whole decision: read it, post it, or drop it.
 * Same actions as the agent's Posts tab, surfaced where the user is looking.
 */
export function DraftApprovalCard({
  draft,
  agentTitle,
  compact,
}: {
  draft: PostDraft;
  agentTitle?: string;
  /** Body collapsed by default, for a busy list. */
  compact?: boolean;
}) {
  const publish = usePublishPostDraft();
  const schedule = useSchedulePostDraft();
  const setStatus = useSetPostDraftStatus();
  const { confirm, dialog } = useConfirm();
  const [openBody, setOpenBody] = useState(!compact);

  const results = draftResults(draft);
  const posted = new Set(results.filter((r) => r.status === "posted").map((r) => r.subreddit));
  const targets = draft.subreddits.filter((s) => !posted.has(s));
  const busy = publish.isPending || schedule.isPending || setStatus.isPending;

  async function approve() {
    if (targets.length === 0) return;
    if (targets.length === 1) {
      const ok = await confirm({
        title: `Post to r/${targets[0]} now?`,
        description:
          "This publishes to Reddit from your connected account right away. You can still delete it on Reddit afterwards.",
        confirmLabel: "Post it",
      });
      if (ok)
        publish.mutate({
          draftId: draft.id,
          subreddits: targets,
          title: draft.title,
          body: draft.body,
        });
      return;
    }
    const ok = await confirm({
      title: `Schedule ${targets.length} posts?`,
      description:
        "They go out one at a time, spaced about 20 minutes apart starting now, so it never looks like a spam blast. You can retime or cancel any of them on the calendar.",
      confirmLabel: `Schedule ${targets.length} posts`,
    });
    if (ok)
      schedule.mutate({
        draftId: draft.id,
        subreddits: targets,
        title: draft.title,
        body: draft.body,
      });
  }

  const error = publish.isError
    ? (publish.error as Error)?.message
    : schedule.isError
      ? (schedule.error as Error)?.message
      : null;

  return (
    <div className="bg-muted/30 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
          Post drafted
        </span>
        {agentTitle && draft.task_id && (
          <Link
            to="/agents/$agentId"
            params={{ agentId: draft.task_id }}
            className="text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <Sparkles className="size-3" /> {agentTitle}
          </Link>
        )}
        <span className="text-muted-foreground">
          {targets.length > 0
            ? `for ${targets.map((s) => `r/${s}`).join(", ")}`
            : "no subreddit picked yet"}
        </span>
      </div>

      <p className="mt-1.5 leading-snug font-medium">{draft.title}</p>

      {openBody ? (
        <div className="bg-card mt-2 rounded-lg border px-3 py-2 text-sm">
          <ChatMarkdown>{draft.body}</ChatMarkdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpenBody(true)}
          className="text-muted-foreground hover:text-foreground mt-1 block w-full text-left text-sm"
        >
          <span className="line-clamp-2">{draft.body}</span>
          <span className="text-primary text-xs font-medium">Read it all</span>
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8" disabled={busy || targets.length === 0} onClick={approve}>
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : targets.length > 1 ? (
            <CalendarClock className="size-3.5" />
          ) : (
            <Send className="size-3.5" />
          )}
          {targets.length > 1 ? `Approve and schedule ${targets.length}` : "Approve and post"}
        </Button>
        {draft.task_id && (
          <Link
            to="/agents/$agentId"
            params={{ agentId: draft.task_id }}
            className="text-muted-foreground hover:text-primary text-xs font-medium"
          >
            Edit first
          </Link>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus.mutate({ id: draft.id, status: "dismissed" })}
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs font-medium"
        >
          <X className="size-3" /> Dismiss
        </button>
      </div>

      {publish.isSuccess && (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
          <Check className="size-3.5" /> Posted.
        </p>
      )}
      {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
      {dialog}
    </div>
  );
}
