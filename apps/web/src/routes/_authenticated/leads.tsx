import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Textarea } from "@workspace/ui/components/textarea";
import { ArrowUpRight, Check, Copy, MessageSquare, Target, X } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/features/dashboard/ui";
import { useLeads, useSetLeadStatus } from "@/features/leads/hooks";
import type { Lead } from "@/features/leads/queries";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

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

function LeadsPage() {
  const { data: leads, isLoading } = useLeads();
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
    <div className="flowy-page">
      <PageHeader
        title="Leads"
        subtitle="Reddit conversations worth replying to. Review the draft, post it yourself, then mark it done."
      />

      <div className="mb-5 flex gap-1.5">
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
        <EmptyState filter={filter} />
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

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <Target className="size-6" />
        </span>
        {filter === "new" ? (
          <>
            <p className="font-medium">No new leads yet</p>
            <p className="text-muted-foreground max-w-md text-sm">
              Ask Flowy in chat to "monitor Reddit for leads" and it will set up an agent that
              watches for prospects and drafts replies. They show up here.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing here yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const setStatus = useSetLeadStatus();
  const [draft, setDraft] = useState(lead.draft_reply ?? "");
  const [copied, setCopied] = useState(false);

  const done = lead.status === "posted" || lead.status === "dismissed";

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
    <Card className={done ? "opacity-60" : ""}>
      <CardContent className="p-5">
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

        {!done && (
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
              <Button
                size="sm"
                onClick={() =>
                  setStatus.mutate({ id: lead.id, status: "posted", draftReply: draft })
                }
              >
                <Check className="size-4" /> Mark posted
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
          </>
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
      </CardContent>
    </Card>
  );
}
