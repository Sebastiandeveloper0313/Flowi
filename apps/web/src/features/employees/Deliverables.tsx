import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowUpRight, Check, Loader2, X } from "lucide-react";

import { useConfirm } from "@/components/useConfirm";
import { usePostLeadReply, useSetLeadStatus } from "@/features/leads/hooks";
import type { Lead } from "@/features/leads/queries";
import { draftResults, type PostDraft } from "@/features/posts/queries";
import { formatWhen } from "@/features/tasks/hooks";
import type { Task, TaskRun } from "@/features/tasks/queries";
import { runSummaryLine } from "@/features/tasks/ui";

/**
 * A found lead with the drafted reply, reviewable in place: the thread, what
 * the employee wrote, and the decision buttons. Posting from here IS the
 * approval (same vetted path as the Leads panel).
 */
export function LeadReplyCard({ lead }: { lead: Lead }) {
  const post = usePostLeadReply();
  const dismiss = useSetLeadStatus();
  const { confirm, dialog } = useConfirm();
  const busy = post.isPending || dismiss.isPending;

  async function postNow() {
    const ok = await confirm({
      title: lead.subreddit ? `Post this reply in r/${lead.subreddit}?` : "Post this reply?",
      description: "It goes out from your connected Reddit account right away and can't be unsent.",
      confirmLabel: "Post reply",
    });
    if (ok) post.mutate({ lead, text: lead.draft_reply ?? "" });
  }

  return (
    <div className="bg-muted/30 rounded-xl border p-4">
      <a href={lead.url} target="_blank" rel="noreferrer" className="group block">
        <p className="text-muted-foreground text-xs">
          {lead.subreddit ? `r/${lead.subreddit}` : "Reddit"}
          {lead.author ? ` · u/${lead.author}` : ""}
        </p>
        <p className="group-hover:text-primary line-clamp-1 text-sm font-medium transition">
          {lead.title}
        </p>
        {lead.snippet && (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{lead.snippet}</p>
        )}
      </a>

      <div className="border-primary/30 mt-3 border-l-2 pl-3">
        <p className="line-clamp-3 text-sm">{lead.draft_reply}</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" className="h-8" disabled={busy} onClick={() => void postNow()}>
          {post.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Post reply
        </Button>
        {lead.task_id && (
          <Link
            to="/agents/$agentId"
            params={{ agentId: lead.task_id }}
            className="text-muted-foreground hover:text-primary text-xs font-medium"
          >
            Edit first
          </Link>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => dismiss.mutate({ id: lead.id, status: "dismissed" })}
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs font-medium"
        >
          <X className="size-3" /> Skip
        </button>
      </div>
      {post.isError && (
        <p className="text-destructive mt-2 text-xs">{(post.error as Error).message}</p>
      )}
      {dialog}
    </div>
  );
}

export interface WorkItem {
  id: string;
  at: string;
  tone: "done" | "draft" | "queued" | "failed";
  headline: string;
  preview?: string;
  /** External proof (the live Reddit thread / post). */
  href?: string;
  /** Internal detail page (the agent) when there's nothing live to open. */
  agentId?: string;
}

/**
 * Merge an employee's artifacts into one portfolio timeline: replies that
 * went out, posts drafted/queued/published, and run summaries for the kinds
 * whose work isn't stored as an artifact. Succeeded reddit runs are skipped;
 * their output already appears as the leads and drafts themselves.
 */
export function buildWorkItems(input: {
  leads: Lead[];
  drafts: PostDraft[];
  runs: TaskRun[];
  tasks: Task[];
}): WorkItem[] {
  const kindById = new Map(input.tasks.map((t) => [t.id, t.kind ?? ""]));
  const items: WorkItem[] = [];

  for (const l of input.leads) {
    const where = l.subreddit ? `r/${l.subreddit}` : "Reddit";
    if (l.status === "posted") {
      items.push({
        id: `lead-${l.id}`,
        at: l.updated_at,
        tone: "done",
        headline: `Replied in ${where}: ${l.title}`,
        preview: l.draft_reply ?? undefined,
        href: l.url,
      });
    } else if (l.status === "queued") {
      items.push({
        id: `lead-${l.id}`,
        at: l.created_at,
        tone: "queued",
        headline: `Reply to "${l.title}" is queued for ${where}`,
        preview: l.draft_reply ?? undefined,
        agentId: l.task_id ?? undefined,
      });
    }
  }

  for (const d of input.drafts) {
    if (d.status === "dismissed") continue;
    const results = draftResults(d);
    const posted = results.filter((r) => r.status === "posted");
    if (d.status === "posted" || posted.length > 0) {
      items.push({
        id: `draft-${d.id}`,
        at: d.updated_at,
        tone: "done",
        headline: `Posted "${d.title}"${
          posted.length > 0 ? ` to ${posted.map((r) => `r/${r.subreddit}`).join(", ")}` : ""
        }`,
        preview: d.body,
        href: posted.find((r) => r.url)?.url,
        agentId: d.task_id ?? undefined,
      });
    } else if (d.status === "queued") {
      items.push({
        id: `draft-${d.id}`,
        at: d.updated_at,
        tone: "queued",
        headline: `Post queued: "${d.title}"`,
        preview: d.body,
        agentId: d.task_id ?? undefined,
      });
    } else {
      items.push({
        id: `draft-${d.id}`,
        at: d.created_at,
        tone: "draft",
        headline: `Drafted post: "${d.title}"`,
        preview: d.body,
        agentId: d.task_id ?? undefined,
      });
    }
  }

  for (const r of input.runs) {
    if (r.status === "running" || r.status === "queued") continue;
    // A skipped run did no work (a prerequisite was missing), so it is not a
    // deliverable and never belongs in the portfolio feed.
    if (r.status === "skipped") continue;
    const kind = kindById.get(r.task_id) ?? "";
    if (r.status === "succeeded" && (kind === "reddit_monitor" || kind === "reddit_post")) {
      continue; // its output is already in the feed as leads / drafts
    }
    items.push({
      id: `run-${r.id}`,
      at: r.created_at,
      tone: r.status === "succeeded" ? "done" : "failed",
      headline: input.tasks.find((t) => t.id === r.task_id)?.title ?? "A skill ran",
      preview: runSummaryLine(r),
      agentId: r.task_id,
    });
  }

  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const TONE_DOT: Record<WorkItem["tone"], string> = {
  done: "bg-green-500",
  draft: "bg-[#1566e6]",
  queued: "bg-amber-500",
  failed: "bg-destructive",
};

/** One row of the portfolio: what got made, a peek at it, and where it lives. */
export function WorkItemRow({ item }: { item: WorkItem }) {
  const body = (
    <>
      <span className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${TONE_DOT[item.tone]}`} />
      <div className="min-w-0 flex-1">
        <p className="group-hover:text-primary truncate text-sm font-medium transition">
          {item.headline}
        </p>
        {item.preview && (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{item.preview}</p>
        )}
      </div>
      <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
        {formatWhen(item.at)}
        {item.href && <ArrowUpRight className="size-3.5" />}
      </span>
    </>
  );
  const cls = "hover:bg-muted/40 group flex items-start gap-3 rounded-lg px-2 py-2.5 transition";

  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  if (item.agentId) {
    return (
      <Link to="/agents/$agentId" params={{ agentId: item.agentId }} className={cls}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}
