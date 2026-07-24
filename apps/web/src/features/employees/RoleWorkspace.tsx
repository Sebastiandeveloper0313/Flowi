import { Link } from "@tanstack/react-router";
import type { Tables } from "@workspace/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { CalendarDays, Check, Newspaper, Target } from "lucide-react";

import { ConnectButton, toolkitLogo, toolkitName } from "@/features/integrations/ConnectCta";
import { useIntegrations } from "@/features/integrations/hooks";
import { draftResults } from "@/features/posts/queries";
import type { Task } from "@/features/tasks/queries";

import { kindLine, type EmployeeMeta } from "./roles";

type Lead = Tables<"leads">;
type Draft = Tables<"post_drafts">;

export interface Deliverables {
  leads: Lead[];
  drafts: Draft[];
}

/**
 * The top of an employee's page is their trade's own workspace: a publishing
 * calendar for the social manager, a pipeline for growth, a content shelf for
 * the writer. Their agents fill it, so it is a live read of the job rather
 * than a board someone has to maintain.
 */
export function RoleWorkspace({
  meta,
  mine,
  deliverables,
}: {
  meta: EmployeeMeta;
  mine: Task[];
  deliverables?: Deliverables;
}) {
  if (meta.role === "social") return <SocialCalendar mine={mine} deliverables={deliverables} />;
  if (meta.role === "growth") return <GrowthPipeline deliverables={deliverables} />;
  if (meta.role === "content") return <ContentShelf mine={mine} deliverables={deliverables} />;
  return null;
}

/* ------------------------------------------------------------------ social */

interface Slot {
  at: Date;
  title: string;
  detail: string;
  tone: "posted" | "queued" | "planned";
  agentId?: string;
}

const TONE: Record<Slot["tone"], string> = {
  posted: "border-emerald-200 bg-emerald-50 text-emerald-900",
  queued: "border-amber-200 bg-amber-50 text-amber-900",
  planned: "border-[#bcd6f2] bg-[#eef4fd] text-[#12447f]",
};

/** The Monday-first week containing today, as seven midnight dates. */
function weekDays(): Date[] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** Which networks this employee's agents actually publish to. */
const KIND_TOOLKIT: Record<string, string> = {
  reddit_post: "reddit",
  reddit_monitor: "reddit",
  linkedin_post: "linkedin",
  facebook_post: "facebook",
  facebook_dm: "facebook",
};

function SocialCalendar({ mine, deliverables }: { mine: Task[]; deliverables?: Deliverables }) {
  const days = weekDays();
  const from = days[0].getTime();
  const to = days[6].getTime() + 24 * 60 * 60 * 1000;
  const slots: Slot[] = [];

  // Real posts. Reddit drafts carry a time per subreddit; everything else has
  // one time for the whole draft.
  for (const d of deliverables?.drafts ?? []) {
    const results = draftResults(d);
    if (results.length > 0) {
      for (const r of results) {
        if (!r.at || r.status === "failed") continue;
        slots.push({
          at: new Date(r.at),
          title: d.title || "Post",
          detail: `r/${r.subreddit}`,
          tone: r.status === "posted" ? "posted" : "queued",
          agentId: d.task_id ?? undefined,
        });
      }
    } else {
      const at = d.scheduled_at ?? (d.status === "posted" ? d.updated_at : null);
      if (!at) continue;
      slots.push({
        at: new Date(at),
        title: d.title || "Post",
        detail: d.status === "posted" ? "Published" : "Waiting for your OK",
        tone: d.status === "posted" ? "posted" : "queued",
        agentId: d.task_id ?? undefined,
      });
    }
  }

  // What the schedule promises next, so quiet days read as planned, not idle.
  for (const t of mine) {
    if (!t.next_run_at || t.status !== "active") continue;
    slots.push({
      at: new Date(t.next_run_at),
      title: t.title,
      detail: kindLine(t.kind),
      tone: "planned",
      agentId: t.id,
    });
  }

  const inWeek = slots.filter((s) => s.at.getTime() >= from && s.at.getTime() < to);
  const today = new Date().toDateString();

  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4" /> This week
          </span>
          <Channels mine={mine} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const items = inWeek
              .filter((s) => s.at.toDateString() === day.toDateString())
              .sort((a, b) => a.at.getTime() - b.at.getTime());
            const isToday = day.toDateString() === today;
            return (
              <div key={day.toISOString()} className="min-w-0">
                <div
                  className={`mb-1.5 text-center text-xs font-medium ${
                    isToday ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {day.toLocaleDateString([], { weekday: "short" })} {day.getDate()}
                </div>
                <div
                  className={`min-h-24 space-y-1 rounded-xl border p-1.5 ${
                    isToday ? "border-primary/30 bg-[#eef4fd]/40" : "bg-muted/20"
                  }`}
                >
                  {items.map((s, i) => {
                    const body = (
                      <>
                        <p className="truncate text-[11px] font-medium">{s.title}</p>
                        <p className="truncate text-[10px] opacity-70">
                          {s.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{" "}
                          {s.detail}
                        </p>
                      </>
                    );
                    const cls = `block rounded-lg border px-1.5 py-1 ${TONE[s.tone]}`;
                    return s.agentId ? (
                      <Link
                        key={i}
                        to="/agents/$agentId"
                        params={{ agentId: s.agentId }}
                        className={cls}
                        title={`${s.title} · ${s.detail}`}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div key={i} className={cls}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-4 text-xs">
          <Legend color="bg-emerald-500" label="Published" />
          <Legend color="bg-amber-500" label="Queued" />
          <Legend color="bg-[#1566e6]" label="Scheduled run" />
          {inWeek.length === 0 && <span>Nothing planned this week yet.</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} /> {label}
    </span>
  );
}

/** The accounts this employee posts from, connectable right here. */
function Channels({ mine }: { mine: Task[] }) {
  const { data: integrations } = useIntegrations();
  const needed = [...new Set(mine.map((t) => KIND_TOOLKIT[t.kind ?? ""]).filter(Boolean))];
  const slugs = needed.length > 0 ? needed : ["reddit", "linkedin", "facebook"];

  return (
    <span className="flex flex-wrap items-center gap-2">
      {slugs.map((slug) => {
        const connected = !!integrations?.find((t) => t.slug === slug)?.connected;
        return connected ? (
          <span
            key={slug}
            className="text-muted-foreground flex items-center gap-1.5 rounded-full border bg-emerald-50 px-2.5 py-1 text-xs font-medium"
            title={`${toolkitName(slug)} connected`}
          >
            <img src={toolkitLogo(slug)} alt="" className="size-3.5 rounded-sm" />
            {toolkitName(slug)}
            <Check className="size-3 text-emerald-600" />
          </span>
        ) : (
          <ConnectButton key={slug} toolkit={slug} />
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ growth */

function GrowthPipeline({ deliverables }: { deliverables?: Deliverables }) {
  const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const leads = (deliverables?.leads ?? []).filter((l) => new Date(l.created_at).getTime() >= week);
  const waiting = leads.filter((l) => l.status === "new" && (l.draft_reply ?? "").trim() !== "");
  const replied = leads.filter((l) => l.status === "posted");
  const passed = leads.filter((l) => l.status === "skipped");

  // Where the good conversations actually are, so the boss can tell the
  // employee to lean into a community or drop one.
  const bySource = new Map<string, { found: number; replied: number }>();
  for (const l of leads) {
    const key = l.subreddit ? `r/${l.subreddit}` : l.source;
    const row = bySource.get(key) ?? { found: 0, replied: 0 };
    row.found += 1;
    if (l.status === "posted") row.replied += 1;
    bySource.set(key, row);
  }
  const sources = [...bySource.entries()].sort((a, b) => b[1].found - a[1].found).slice(0, 6);
  const top = sources[0]?.[1].found ?? 1;

  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4" /> Pipeline this week
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stage label="Conversations found" value={leads.length} />
          <Stage label="Replies drafted" value={waiting.length} tone="amber" />
          <Stage label="Replies posted" value={replied.length} tone="emerald" />
          <Stage label="Passed on" value={passed.length} />
        </div>

        {sources.length > 0 && (
          <div className="mt-5">
            <p className="text-muted-foreground mb-2 text-xs font-medium">Where they came from</p>
            <div className="space-y-1.5">
              {sources.map(([name, row]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm font-medium">{name}</span>
                  <div className="bg-muted h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                    <div
                      className="bg-primary/70 h-full rounded-full"
                      style={{ width: `${Math.round((row.found / top) * 100)}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground w-28 shrink-0 text-right text-xs tabular-nums">
                    {row.found} found · {row.replied} replied
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {leads.length === 0 && (
          <p className="text-muted-foreground mt-4 text-sm">
            No conversations yet this week. They land here the moment a lead agent runs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stage({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "emerald";
}) {
  const color =
    tone === "amber"
      ? "text-amber-700"
      : tone === "emerald"
        ? "text-emerald-700"
        : "text-foreground";
  return (
    <div className="bg-muted/30 rounded-xl border p-3">
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{label}</p>
    </div>
  );
}

/* ----------------------------------------------------------------- content */

function ContentShelf({ mine, deliverables }: { mine: Task[]; deliverables?: Deliverables }) {
  const drafts = (deliverables?.drafts ?? []).slice(0, 6);
  const next = mine
    .filter((t) => t.status === "active" && t.next_run_at)
    .sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime())[0];

  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="size-4" /> The shelf
        </CardTitle>
      </CardHeader>
      <CardContent>
        {drafts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing written yet.
            {next
              ? ` The next piece is due ${new Date(next.next_run_at!).toLocaleDateString([], {
                  weekday: "long",
                })}.`
              : ""}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {drafts.map((d) => (
              <Link
                key={d.id}
                to="/agents/$agentId"
                params={{ agentId: d.task_id ?? "" }}
                className="hover:border-primary/40 bg-muted/20 block rounded-xl border p-3 transition"
              >
                <p className="line-clamp-2 text-sm font-medium">{d.title || "Untitled"}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {d.status === "posted" ? "Delivered" : "Waiting for your OK"} ·{" "}
                  {new Date(d.updated_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
