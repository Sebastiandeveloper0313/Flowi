import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  ArrowUpRight,
  Clock,
  Copy,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useConfirm } from "@/components/useConfirm";

import { useAgentLeads, usePostLeadReply, useSetLeadStatus } from "./hooks";
import type { Lead } from "./queries";

type Filter = "new" | "posted" | "dismissed";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function relevanceClass(r: number): string {
  if (r >= 80) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (r >= 60) return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

/** The review queue for an agent's Reddit leads. */
export function LeadsPanel({ taskId }: { taskId: string }) {
  const { data: leads, isLoading } = useAgentLeads(taskId);
  const [filter, setFilter] = useState<Filter>("new");

  const counts = useMemo(() => {
    const c = { new: 0, posted: 0, dismissed: 0 };
    for (const l of leads ?? []) {
      if (l.status === "new" || l.status === "approved") c.new++;
      else if (l.status === "posted") c.posted++;
      else if (l.status === "dismissed") c.dismissed++;
    }
    return c;
  }, [leads]);

  const shown = (leads ?? []).filter((l) =>
    filter === "new" ? l.status === "new" || l.status === "approved" : l.status === filter,
  );

  const TABS: { key: Filter; label: string; n: number }[] = [
    { key: "new", label: "New", n: counts.new },
    { key: "posted", label: "Posted", n: counts.posted },
    { key: "dismissed", label: "Dismissed", n: counts.dismissed },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              filter === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
            {t.n > 0 && <span className="ml-1.5 opacity-70">{t.n}</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading leads...</p>
      ) : shown.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed px-6 py-12 text-center">
          <Target className="mx-auto mb-2 size-6 opacity-60" />
          <p className="text-sm">
            {filter === "new"
              ? "No new leads yet. This agent drafts a reply for each Reddit prospect it finds, and they show up here."
              : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {shown.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const setStatus = useSetLeadStatus();
  const post = usePostLeadReply();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState(lead.draft_reply ?? "");
  const [copied, setCopied] = useState(false);

  const queued = lead.status === "approved";
  const done = lead.status === "posted" || lead.status === "dismissed";

  async function postReply() {
    const ok = await confirm({
      title: lead.subreddit ? `Post to r/${lead.subreddit}?` : "Post this reply to Reddit?",
      description:
        "This posts your reply to Reddit from your connected account right now. You can still delete it on Reddit afterwards.",
      confirmLabel: "Post reply",
    });
    if (ok) post.mutate({ lead, text: draft });
  }

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; ignore */
    }
  }

  return (
    <div className={`rounded-2xl border p-5 ${done ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {lead.subreddit && <span className="font-semibold">r/{lead.subreddit}</span>}
        <span
          className={`rounded-full border px-2 py-0.5 font-medium ${relevanceClass(lead.relevance)}`}
        >
          {lead.relevance}% match
        </span>
        {typeof lead.score === "number" && (
          <span className="text-muted-foreground">▲ {lead.score}</span>
        )}
        <span className="text-muted-foreground">{timeAgo(lead.created_at)}</span>
        {queued && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
            Reply queued
          </span>
        )}
        {lead.status === "posted" && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
            Posted
          </span>
        )}
        {lead.status === "dismissed" && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            Dismissed
          </span>
        )}
      </div>

      <a
        href={lead.url}
        target="_blank"
        rel="noreferrer"
        className="hover:text-primary mt-2 inline-flex items-start gap-1 leading-snug font-semibold"
      >
        {lead.title}
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 opacity-60" />
      </a>

      {lead.reason && (
        <p className="text-muted-foreground mt-1.5 text-sm">
          <span className="text-foreground font-medium">Why: </span>
          {lead.reason}
        </p>
      )}

      {lead.snippet && (
        <p className="text-muted-foreground bg-muted/50 mt-2 line-clamp-3 rounded-lg p-3 text-sm leading-relaxed">
          {lead.snippet}
        </p>
      )}

      {queued && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Clock className="size-4" /> Reply queued for your approval.
          </span>
          <Button size="sm" variant="outline" asChild>
            <Link to="/approvals">Review in Approvals</Link>
          </Button>
          <div className="grow" />
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setStatus.mutate({ id: lead.id, status: "dismissed" })}
          >
            <X className="size-4" /> Dismiss
          </Button>
        </div>
      )}

      {!done && !queued && (
        <>
          <div className="mt-4">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
              <MessageSquare className="size-3.5" /> Drafted reply
            </span>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              className="resize-y text-sm"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={copyReply}>
              <Copy className="size-4" /> {copied ? "Copied" : "Copy reply"}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={lead.url} target="_blank" rel="noreferrer">
                <ArrowUpRight className="size-4" /> Open post
              </a>
            </Button>
            <div className="grow" />
            <Button size="sm" disabled={post.isPending || !draft.trim()} onClick={postReply}>
              {post.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {post.isPending ? "Posting…" : "Post reply"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setStatus.mutate({ id: lead.id, status: "dismissed" })}
            >
              <X className="size-4" /> Dismiss
            </Button>
          </div>
          {post.isError && (
            <p className="text-destructive mt-2 text-sm">
              {(post.error as Error)?.message || "Couldn't post the reply. Try again."}
            </p>
          )}
        </>
      )}
      {dialog}

      {post.isSuccess && post.data?.edited && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#3d82f5]/25 bg-[#3d82f5]/5 p-3 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[#3d82f5]" />
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">Sentrive is learning your style.</span>{" "}
            You edited this one, so future drafts will sound more like you. Set your preferences
            anytime in Settings.
          </span>
        </div>
      )}

      {done && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setStatus.mutate({ id: lead.id, status: "new" })}
          >
            Move back to New
          </Button>
        </div>
      )}
    </div>
  );
}
