import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Tables } from "@workspace/supabase/types";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Inbox,
  Maximize2,
  Newspaper,
  Plus,
  Repeat,
  Target,
} from "lucide-react";
import { useState } from "react";

import type { Approval } from "@/features/approvals/queries";
import { DESK_DRAFT_KEY } from "@/features/chat/Chat";
import { ChatMarkdown } from "@/features/chat/Markdown";
import { ConnectButton, toolkitLogo, toolkitName } from "@/features/integrations/ConnectCta";
import { useIntegrations } from "@/features/integrations/hooks";
import { useRescheduleDraft, useReschedulePost } from "@/features/posts/hooks";
import { draftResults, type SubPostResult } from "@/features/posts/queries";
import { occurrencesIn, useUpdateTaskSchedule } from "@/features/tasks/hooks";
import type { Task, TaskRun } from "@/features/tasks/queries";
import { RunResultActions } from "@/features/tasks/RunResultActions";

import { type EmployeeMeta } from "./roles";

type Lead = Tables<"leads">;
type Draft = Tables<"post_drafts">;

export interface Deliverables {
  leads: Lead[];
  drafts: Draft[];
}

/**
 * The top of an employee's page is their trade's own workspace: a publishing
 * calendar for the social manager, a pipeline for growth, a shelf for the
 * writer. Their agents fill it, so it is a live read of the job rather than a
 * board someone has to maintain.
 */
export function RoleWorkspace({
  meta,
  mine,
  deliverables,
  runs,
  approvals,
  onOpenChat,
}: {
  meta: EmployeeMeta;
  mine: Task[];
  deliverables?: Deliverables;
  runs?: TaskRun[];
  approvals?: Approval[];
  onOpenChat?: () => void;
}) {
  if (meta.role === "social")
    return (
      <SocialCalendar
        meta={meta}
        mine={mine}
        deliverables={deliverables}
        runs={runs}
        onOpenChat={onOpenChat}
      />
    );
  if (meta.role === "growth") {
    // Growth also owns SEO/content now, so show the shelf under the pipeline
    // when there are content agents, keeping articles readable in place.
    const hasContent = mine.some((t) => CONTENT_KINDS.has(t.kind ?? ""));
    return (
      <>
        <GrowthPipeline deliverables={deliverables} />
        {hasContent && <ContentShelf meta={meta} mine={mine} runs={runs} />}
      </>
    );
  }
  if (meta.role === "support")
    return <SupportDesk meta={meta} mine={mine} runs={runs} approvals={approvals} />;
  if (meta.role === "ops") return <OpsDesk meta={meta} mine={mine} runs={runs} />;
  return null;
}

/* --------------------------------------------------------------- operations */

/**
 * The operations manager's page is the brief itself. Anything else would be a
 * dashboard about a report about the work, which is one layer too many.
 */
function OpsDesk({ meta, mine, runs }: { meta: EmployeeMeta; mine: Task[]; runs?: TaskRun[] }) {
  const briefIds = new Set(mine.filter((t) => t.kind === "ops_brief").map((t) => t.id));
  const latest = (runs ?? [])
    .filter((r) => briefIds.has(r.task_id) && r.status === "succeeded" && (r.output ?? "").trim())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ClipboardList className="size-4" /> Latest brief
          </span>
          {latest && (
            <span className="text-muted-foreground text-xs font-normal">
              {new Date(latest.created_at).toLocaleString([], {
                weekday: "long",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {latest ? (
          <div className="text-sm leading-relaxed">
            <ChatMarkdown>{latest.output ?? ""}</ChatMarkdown>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No brief yet. {meta.name} writes one from your own workspace data, so hit Start now on
            his schedule below and the first one lands here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ social */

type ItemStatus = "posted" | "queued" | "draft" | "planned";

interface CalItem {
  key: string;
  at: Date;
  title: string;
  body?: string;
  platform?: string;
  status: ItemStatus;
  url?: string;
  taskId?: string;
  /** Runs folded into this one chip, for cadences that fire many times a day. */
  count?: number;
  /** Everything needed to move it, or undefined when it can't be moved. */
  move?:
    | { type: "sub"; draftId: string; subreddit: string; results: SubPostResult[] }
    | { type: "draft"; draftId: string }
    | { type: "run"; taskId: string; cron: string };
}

const STATUS_STYLE: Record<ItemStatus, { bar: string; chip: string; label: string }> = {
  posted: { bar: "#059669", chip: "bg-emerald-50 text-emerald-700", label: "Published" },
  queued: { bar: "#d97706", chip: "bg-amber-50 text-amber-700", label: "Queued" },
  draft: { bar: "#64748b", chip: "bg-slate-100 text-slate-600", label: "Draft" },
  planned: { bar: "#1566e6", chip: "bg-[#eef4fd] text-[#12447f]", label: "Scheduled run" },
};

/** Which network an agent publishes to, for logos and the connect strip. */
const KIND_TOOLKIT: Record<string, string> = {
  reddit_post: "reddit",
  reddit_monitor: "reddit",
  linkedin_post: "linkedin",
  facebook_post: "facebook",
  facebook_dm: "facebook",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** The Monday-first week containing `anchor`. */
function weekOf(anchor: Date): Date[] {
  const start = midnight(anchor);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
}

/** Whole weeks covering `anchor`'s month, Monday first (35 or 42 cells). */
function monthOf(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = weekOf(first)[0];
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const cells = Math.ceil((last.getTime() - start.getTime()) / DAY_MS / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(start.getTime() + i * DAY_MS));
}

/**
 * Same clock time, different day. Nothing may land in the past, so a drop onto
 * today whose time has passed goes out in five minutes instead.
 */
function moveToDay(at: Date, day: Date): Date {
  const next = new Date(day);
  next.setHours(at.getHours(), at.getMinutes(), 0, 0);
  const soon = Date.now() + 5 * 60_000;
  return next.getTime() < soon ? new Date(soon) : next;
}

/**
 * A weekly cron moved to another weekday. Returns null when the cadence isn't
 * a fixed weekly time (daily, hourly, day-of-month), where dropping on a day
 * has no honest meaning.
 */
function cronOnWeekday(cron: string, dow: number): string | null {
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return null;
  const [m, h, dom, mon, d] = p;
  if (dom !== "*" || d === "*" || !/^\d+$/.test(m) || !/^\d+$/.test(h)) return null;
  return `${m} ${h} * ${mon} ${dow}`;
}

/** Ask the employee to plan something, in their own chat. */
function askEmployee(text: string, onOpenChat?: () => void) {
  if (!onOpenChat) return;
  try {
    sessionStorage.setItem(DESK_DRAFT_KEY, text);
  } catch {
    /* storage blocked: the chat just opens empty */
  }
  onOpenChat();
}

function SocialCalendar({
  meta,
  mine,
  deliverables,
  runs,
  onOpenChat,
}: {
  meta: EmployeeMeta;
  mine: Task[];
  deliverables?: Deliverables;
  runs?: TaskRun[];
  onOpenChat?: () => void;
}) {
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<CalItem | null>(null);

  const queryClient = useQueryClient();
  const reschedulePost = useReschedulePost();
  const rescheduleDraft = useRescheduleDraft();
  const setSchedule = useUpdateTaskSchedule();
  const moving = reschedulePost.isPending || rescheduleDraft.isPending || setSchedule.isPending;

  const days = view === "week" ? weekOf(anchor) : monthOf(anchor);
  const rangeEnd = new Date(days[days.length - 1].getTime() + DAY_MS);

  const kindByTask = new Map(mine.map((t) => [t.id, t.kind ?? ""]));
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const items: CalItem[] = [];

  for (const d of deliverables?.drafts ?? []) {
    const platform = KIND_TOOLKIT[kindByTask.get(d.task_id ?? "") ?? ""];
    const results = draftResults(d);
    if (results.length > 0) {
      // Reddit: one entry per subreddit, each with its own time.
      for (const r of results) {
        if (!r.at || r.status === "failed") continue;
        items.push({
          key: `${d.id}:${r.subreddit}`,
          at: new Date(r.at),
          title: d.title || "Post",
          body: d.body,
          platform: platform ?? "reddit",
          status: r.status === "posted" ? "posted" : "queued",
          url: r.url,
          taskId: d.task_id ?? undefined,
          move:
            r.status === "queued"
              ? { type: "sub", draftId: d.id, subreddit: r.subreddit, results }
              : undefined,
        });
      }
    } else {
      if (d.status === "dismissed") continue;
      // A written-but-unscheduled post has no time of its own, so it would
      // vanish from the calendar. Land it on the day it was written as a draft
      // chip, so "it wrote a post" is actually visible here, not only in the
      // waiting list.
      const at = d.scheduled_at ?? (d.status === "posted" ? d.updated_at : d.created_at);
      items.push({
        key: d.id,
        at: new Date(at),
        title: d.title || "Post",
        body: d.body,
        platform,
        status: d.status === "posted" ? "posted" : d.scheduled_at ? "queued" : "draft",
        taskId: d.task_id ?? undefined,
        move: d.status === "posted" ? undefined : { type: "draft", draftId: d.id },
      });
    }
  }

  // LinkedIn and Facebook posts don't live in post_drafts: the agent's output IS
  // the post (publishing is disabled upstream, so every one is a draft to copy).
  // Surface those succeeded runs as draft chips on the day they were written, so
  // the calendar shows every post the employee made, not only the Reddit ones.
  const RUN_POST_KINDS = new Set(["linkedin_post", "facebook_post"]);
  for (const r of runs ?? []) {
    const kind = kindByTask.get(r.task_id) ?? "";
    if (!RUN_POST_KINDS.has(kind) || r.status !== "succeeded" || !(r.output ?? "").trim()) continue;
    items.push({
      key: `run-post:${r.id}`,
      at: new Date(r.created_at),
      title: pieceTitle(r.output ?? ""),
      body: r.output ?? undefined,
      platform: KIND_TOOLKIT[kind],
      status: "draft",
      taskId: r.task_id,
    });
  }

  // The recurring plan, drawn out across the whole view: every time each agent
  // is due between now and the end of the range, so the calendar shows what is
  // coming instead of a single next run.
  for (const t of mine) {
    if (t.status !== "active") continue;
    const tzSafe = !t.timezone || t.timezone === browserTz;
    const first = t.next_run_at ? new Date(t.next_run_at) : null;
    const due = [
      ...(first && first < rangeEnd ? [first] : []),
      ...occurrencesIn(t.schedule_cron, first ?? new Date(), rangeEnd, 200),
    ];
    // An hourly agent would paint 24 identical chips a day. One chip per day
    // carrying the count says the same thing and stays readable.
    const byDay = new Map<string, Date[]>();
    for (const at of due) {
      const k = at.toDateString();
      byDay.set(k, [...(byDay.get(k) ?? []), at]);
    }
    for (const [, times] of byDay) {
      const shown = times.length > 2 ? [times[0]] : times;
      for (const at of shown) {
        items.push({
          key: `run:${t.id}:${at.getTime()}`,
          at,
          title: t.title,
          body: t.instructions ?? undefined,
          platform: KIND_TOOLKIT[t.kind ?? ""],
          status: "planned",
          taskId: t.id,
          count: times.length > 2 ? times.length : undefined,
          // Only a fixed weekly cadence can honestly be dragged to another day:
          // moving "every day at noon" to Wednesday would mean nothing.
          move:
            tzSafe && t.schedule_cron && cronOnWeekday(t.schedule_cron, 0)
              ? { type: "run", taskId: t.id, cron: t.schedule_cron }
              : undefined,
        });
      }
    }
  }

  function move(item: CalItem, day: Date) {
    if (!item.move || sameDay(item.at, day)) return;
    const at = moveToDay(item.at, day).toISOString();
    const done = { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] }) };
    if (item.move.type === "sub") {
      const { draftId, subreddit, results } = item.move;
      reschedulePost.mutate({ draftId, subreddit, at, results }, done);
    } else if (item.move.type === "draft") {
      rescheduleDraft.mutate({ id: item.move.draftId, at }, done);
    } else {
      const cron = cronOnWeekday(item.move.cron, day.getDay());
      if (cron) setSchedule.mutate({ id: item.move.taskId, scheduleCron: cron }, done);
    }
  }

  const inRange = items.filter(
    (i) => i.at.getTime() >= days[0].getTime() && i.at.getTime() < rangeEnd.getTime(),
  );

  function shift(dir: -1 | 1) {
    const next = new Date(anchor);
    if (view === "week") next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    setAnchor(next);
  }

  const rangeLabel =
    view === "week"
      ? `${days[0].toLocaleDateString([], { month: "short", day: "numeric" })} to ${days[6].toLocaleDateString([], { month: "short", day: "numeric" })}`
      : anchor.toLocaleDateString([], { month: "long", year: "numeric" });

  const grid = (
    <CalendarGrid
      days={days}
      items={inRange}
      view={view}
      month={anchor.getMonth()}
      tall={expanded}
      moving={moving}
      onMove={move}
      onOpen={setOpen}
      onPlan={(day) =>
        askEmployee(
          `Plan a post for ${day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}. Ask me anything you need, then set it up.`,
          onOpenChat,
        )
      }
    />
  );

  const controls = (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="bg-muted/60 flex rounded-full p-0.5">
        {(["week", "month"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              view === v ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Previous"
        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full p-1.5 transition"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => setAnchor(new Date())}
        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full px-2.5 py-1 text-xs font-medium transition"
      >
        Today
      </button>
      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="Next"
        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full p-1.5 transition"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );

  return (
    <>
      <Card className="mb-5 overflow-hidden">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">{meta.name}'s calendar</CardTitle>
              <p className="text-muted-foreground mt-0.5 text-xs">{rangeLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Channels mine={mine} />
              {controls}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label="Expand calendar"
                title="Bigger view"
                className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full p-1.5 transition"
              >
                <Maximize2 className="size-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {grid}
          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-4 text-xs">
            <Legend tone="posted" />
            <Legend tone="queued" />
            <Legend tone="draft" />
            <Legend tone="planned" />
            <span className="ml-auto">Drag anything that hasn't gone out yet to move it.</span>
          </div>
          {inRange.length === 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3">
              <p className="text-muted-foreground min-w-0 flex-1 text-sm">
                Nothing on the calendar {view === "week" ? "this week" : "this month"}. {meta.name}{" "}
                fills it as her agents run.
              </p>
              {onOpenChat && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    askEmployee(
                      `Plan my posting week. Suggest what to publish and when, then set it up.`,
                      onOpenChat,
                    )
                  }
                >
                  Plan the week with {meta.name}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bigger view: the same calendar, room to actually read it. */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-[min(1400px,95vw)]">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-3 pr-8">
              <span>
                {meta.name}'s calendar
                <span className="text-muted-foreground ml-2 text-sm font-normal">{rangeLabel}</span>
              </span>
              {controls}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">{grid}</div>
        </DialogContent>
      </Dialog>

      <ItemDialog item={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Legend({ tone }: { tone: ItemStatus }) {
  const s = STATUS_STYLE[tone];
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: s.bar }} /> {s.label}
    </span>
  );
}

function CalendarGrid({
  days,
  items,
  view,
  month,
  tall,
  moving,
  onMove,
  onOpen,
  onPlan,
}: {
  days: Date[];
  items: CalItem[];
  view: "week" | "month";
  month: number;
  tall: boolean;
  moving: boolean;
  onMove: (item: CalItem, day: Date) => void;
  onOpen: (item: CalItem) => void;
  onPlan: (day: Date) => void;
}) {
  const [dragging, setDragging] = useState<CalItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const today = new Date();
  const byKey = new Map(items.map((i) => [i.key, i]));

  const minH = tall ? (view === "week" ? "min-h-[420px]" : "min-h-[150px]") : "min-h-28";

  return (
    <div className={`grid grid-cols-7 gap-2 ${moving ? "pointer-events-none opacity-70" : ""}`}>
      {days.slice(0, 7).map((d) => (
        <div
          key={`h${d.toISOString()}`}
          className="text-muted-foreground pb-1 text-center text-[11px] font-semibold tracking-wide uppercase"
        >
          {d.toLocaleDateString([], { weekday: "short" })}
        </div>
      ))}

      {days.map((day) => {
        const key = day.toISOString();
        const isToday = sameDay(day, today);
        const dim = view === "month" && day.getMonth() !== month;
        const past = day.getTime() < midnight(today).getTime();
        const dayItems = items
          .filter((i) => sameDay(i.at, day))
          .sort((a, b) => a.at.getTime() - b.at.getTime());
        const canDrop = !!dragging?.move && !past;

        return (
          <div
            key={key}
            onDragOver={(e) => {
              if (!canDrop) return;
              e.preventDefault();
              setOver(key);
            }}
            onDragLeave={() => setOver((o) => (o === key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const item = byKey.get(e.dataTransfer.getData("text/plain"));
              if (item && canDrop) onMove(item, day);
              setDragging(null);
            }}
            className={`group/day relative flex flex-col gap-1 rounded-2xl border p-1.5 transition ${minH} ${
              over === key
                ? "border-primary bg-primary/5 ring-primary/20 ring-2"
                : isToday
                  ? "border-primary/30 bg-[#eef4fd]/50"
                  : "bg-muted/20 hover:bg-muted/30"
            } ${dim ? "opacity-45" : ""}`}
          >
            <div className="flex items-center justify-between px-0.5">
              <span
                className={`grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums ${
                  isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {day.getDate()}
              </span>
              {!past && (
                <button
                  type="button"
                  onClick={() => onPlan(day)}
                  aria-label={`Plan something for ${day.toDateString()}`}
                  className="text-muted-foreground hover:bg-card hover:text-primary rounded-full p-0.5 opacity-0 transition group-hover/day:opacity-100"
                >
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>

            {dayItems.map((item) => (
              <ItemChip
                key={item.key}
                item={item}
                onOpen={() => onOpen(item)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", item.key);
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(item);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ItemChip({
  item,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  item: CalItem;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const s = STATUS_STYLE[item.status];
  const time = item.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <button
      type="button"
      draggable={!!item.move}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      title={
        item.count
          ? `${item.title} · ${item.count} runs today, first at ${time}`
          : `${item.title} · ${s.label} at ${time}`
      }
      className={`bg-card hover:border-primary/40 block w-full rounded-lg border border-l-[3px] px-2 py-1.5 text-left shadow-[0_10px_24px_-22px_rgba(16,48,120,0.5)] transition hover:shadow-[0_14px_28px_-20px_rgba(16,48,120,0.55)] ${
        item.move ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${item.status === "posted" ? "opacity-80" : ""}`}
      style={{ borderLeftColor: s.bar }}
    >
      <span className="flex items-center gap-1">
        {item.platform ? (
          <img src={toolkitLogo(item.platform)} alt="" className="size-3 rounded-[3px]" />
        ) : item.status === "planned" ? (
          <Repeat className="size-3 opacity-60" />
        ) : (
          <Clock className="size-3 opacity-60" />
        )}
        <span className="text-[10px] font-semibold tabular-nums opacity-70">
          {item.count ? `${item.count} runs` : time}
        </span>
        {item.status === "posted" && <Check className="size-3 text-emerald-600" />}
      </span>
      <span className="mt-0.5 line-clamp-2 text-[11px] leading-tight font-medium">
        {item.title}
      </span>
    </button>
  );
}

/** The whole post, read where you clicked it. */
function ItemDialog({ item, onClose }: { item: CalItem | null; onClose: () => void }) {
  if (!item) return null;
  const s = STATUS_STYLE[item.status];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8 text-left leading-snug">{item.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${s.chip}`}>{s.label}</span>
          {item.platform && (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <img src={toolkitLogo(item.platform)} alt="" className="size-3.5 rounded-sm" />
              {toolkitName(item.platform)}
            </span>
          )}
          <span className="text-muted-foreground">
            {item.at.toLocaleString([], {
              weekday: "long",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {item.count ? ` · ${item.count} runs that day` : ""}
          </span>
        </div>
        {item.body && (
          <div className="bg-muted/30 mt-1 rounded-xl p-4 text-sm">
            <ChatMarkdown>{item.body}</ChatMarkdown>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {item.url && (
            <Button asChild size="sm" variant="outline">
              <a href={item.url} target="_blank" rel="noreferrer">
                View it live <ArrowUpRight className="size-3.5" />
              </a>
            </Button>
          )}
          {item.taskId && (
            <Button asChild size="sm" variant="outline" onClick={onClose}>
              <Link to="/agents/$agentId" params={{ agentId: item.taskId }}>
                Open the agent
              </Link>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The accounts this employee posts from. Connecting lives in the banner above. */
function Channels({ mine }: { mine: Task[] }) {
  const { data: integrations } = useIntegrations();
  const slugs = [...new Set(mine.map((t) => KIND_TOOLKIT[t.kind ?? ""]).filter(Boolean))];
  const connected = slugs.filter((s) => integrations?.find((t) => t.slug === s)?.connected);
  if (connected.length === 0) return null;

  return (
    <span className="flex items-center gap-1">
      {connected.map((slug) => (
        <span
          key={slug}
          title={`${toolkitName(slug)} connected`}
          className="bg-card grid size-7 place-items-center rounded-full border shadow-xs"
        >
          <img src={toolkitLogo(slug)} alt={toolkitName(slug)} className="size-4 rounded-sm" />
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ growth */

function GrowthPipeline({ deliverables }: { deliverables?: Deliverables }) {
  const week = Date.now() - 7 * DAY_MS;
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

interface Piece {
  runId: string;
  taskId: string;
  at: string;
  title: string;
  body: string;
}

/**
 * A written piece's title. SEO articles are asked to lead with the title (a
 * markdown heading or a "Title:" line), so pull that out; otherwise fall back
 * to the first non-empty line, trimmed to something card-sized.
 */
function pieceTitle(output: string): string {
  const lines = output.split("\n").map((l) => l.trim());
  for (const l of lines) {
    if (!l) continue;
    const heading = l.match(/^#+\s+(.*)$/);
    if (heading) return heading[1].trim().slice(0, 120);
    const labelled = l.match(/^(?:\*\*)?title(?:\*\*)?\s*:?\s*(.+)$/i);
    if (labelled) return labelled[1].replace(/\*+/g, "").trim().slice(0, 120);
    return l.replace(/\*+/g, "").slice(0, 120);
  }
  return "Untitled piece";
}

/** Kinds whose output is a written piece for the shelf (articles, drafts). */
const CONTENT_KINDS = new Set(["seo_blog", "content"]);

/**
 * The shelf is the written pieces, read right here. Articles live in the run
 * output (not a draft table), so this reads the succeeded runs of the content
 * agents and opens the full piece in a reader, rather than making the user dig
 * into a run row on the agent page. Scoped to content kinds so it's safe to
 * show alongside an employee's other work (e.g. Maya's lead runs).
 */
function ContentShelf({
  meta,
  mine,
  runs,
}: {
  meta: EmployeeMeta;
  mine: Task[];
  runs?: TaskRun[];
}) {
  const [open, setOpen] = useState<Piece | null>(null);
  const titleById = new Map(mine.map((t) => [t.id, t.title]));
  const contentIds = new Set(mine.filter((t) => CONTENT_KINDS.has(t.kind ?? "")).map((t) => t.id));

  const pieces: Piece[] = (runs ?? [])
    .filter((r) => contentIds.has(r.task_id) && r.status === "succeeded" && (r.output ?? "").trim())
    .map((r) => ({
      runId: r.id,
      taskId: r.task_id,
      at: r.created_at,
      title: pieceTitle(r.output ?? ""),
      body: r.output ?? "",
    }));

  const next = mine
    .filter((t) => CONTENT_KINDS.has(t.kind ?? "") && t.status === "active" && t.next_run_at)
    .sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime())[0];

  return (
    <>
      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Newspaper className="size-4" /> The shelf
            {pieces.length > 0 && (
              <span className="text-muted-foreground text-xs font-normal">
                {pieces.length} piece{pieces.length === 1 ? "" : "s"}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pieces.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing written yet.
              {next
                ? ` The next piece is due ${new Date(next.next_run_at!).toLocaleDateString([], {
                    weekday: "long",
                  })}.`
                : ` Hit Start now on ${meta.name}'s schedule below and his first piece lands here.`}
            </p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {pieces.map((p) => (
                <button
                  key={p.runId}
                  type="button"
                  onClick={() => setOpen(p)}
                  className="hover:border-primary/40 bg-muted/20 flex h-full flex-col rounded-xl border p-3.5 text-left transition"
                >
                  <FileText className="text-primary/70 mb-2 size-4 shrink-0" />
                  <p className="line-clamp-3 flex-1 text-sm font-medium">{p.title}</p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {titleById.get(p.taskId) ?? "Content"} ·{" "}
                    {new Date(p.at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-8 text-left leading-snug">{open?.title}</DialogTitle>
          </DialogHeader>
          {open && (
            <>
              <div className="min-h-0 flex-1 overflow-auto text-sm leading-relaxed">
                <ChatMarkdown>{open.body}</ChatMarkdown>
              </div>
              <div className="shrink-0 border-t pt-3">
                <RunResultActions output={open.body} title={open.title} />
                <Link
                  to="/agents/$agentId"
                  params={{ agentId: open.taskId }}
                  className="text-muted-foreground hover:text-primary mt-2 inline-block text-xs font-medium"
                >
                  Open the agent that wrote this
                </Link>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ----------------------------------------------------------------- support */

/** Which channel a support approval went out on, from its tool slug. */
function replyChannel(slug: string): string {
  if (slug.startsWith("GMAIL")) return "email";
  if (slug.startsWith("FACEBOOK")) return "facebook";
  return "";
}

/**
 * Sam's desk is the reply queue: what he has drafted and is waiting to send,
 * and how many he has answered this week. We do not store the inbound inbox
 * (the agent reads it live), so this is honestly about the replies, not a
 * fake mailbox.
 */
function SupportDesk({
  meta,
  mine,
  runs,
  approvals,
}: {
  meta: EmployeeMeta;
  mine: Task[];
  runs?: TaskRun[];
  approvals?: Approval[];
}) {
  const { data: integrations } = useIntegrations();
  const mineIds = new Set(mine.map((t) => t.id));
  const mineApprovals = (approvals ?? []).filter((a) => a.task_id && mineIds.has(a.task_id));

  const week = Date.now() - 7 * DAY_MS;
  const waiting = mineApprovals.filter((a) => a.status === "pending");
  const sent = mineApprovals.filter(
    (a) => a.status === "executed" && new Date(a.decided_at ?? a.created_at).getTime() >= week,
  );
  const lastRun = (runs ?? [])
    .filter((r) => mineIds.has(r.task_id) && r.status === "succeeded")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  // Which inboxes this employee's agents actually work.
  const slugs = [
    ...new Set(
      mine
        .map((t) =>
          t.kind === "email_responder" ? "gmail" : t.kind === "facebook_dm" ? "facebook" : "",
        )
        .filter(Boolean),
    ),
  ];

  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Inbox className="size-4" /> Reply desk
          </span>
          {slugs.length > 0 && (
            <span className="flex items-center gap-1">
              {slugs.map((slug) => {
                const connected = !!integrations?.find((t) => t.slug === slug)?.connected;
                return connected ? (
                  <span
                    key={slug}
                    title={`${toolkitName(slug)} connected`}
                    className="bg-card grid size-7 place-items-center rounded-full border shadow-xs"
                  >
                    <img
                      src={toolkitLogo(slug)}
                      alt={toolkitName(slug)}
                      className="size-4 rounded-sm"
                    />
                  </span>
                ) : (
                  <ConnectButton key={slug} toolkit={slug} />
                );
              })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <Stage
            label="Waiting to send"
            value={waiting.length}
            tone={waiting.length ? "amber" : undefined}
          />
          <Stage label="Answered · 7d" value={sent.length} tone="emerald" />
        </div>

        {waiting.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-muted-foreground text-xs font-medium">Drafted, waiting on you</p>
            {waiting.slice(0, 5).map((a) => (
              <Link
                key={a.id}
                to="/approvals"
                className="hover:border-primary/40 bg-muted/20 flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {replyChannel(a.tool_slug) === "email"
                      ? "Email reply"
                      : replyChannel(a.tool_slug) === "facebook"
                        ? "Messenger reply"
                        : "Reply"}{" "}
                    ·{" "}
                    {new Date(a.created_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <span className="text-primary shrink-0 text-xs font-medium">Review</span>
              </Link>
            ))}
            {waiting.length > 5 && (
              <Link
                to="/approvals"
                className="text-muted-foreground hover:text-foreground block py-1 text-center text-xs font-medium"
              >
                See all {waiting.length} waiting
              </Link>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            Nothing waiting. {meta.name} drafts a reply the moment a real message needs one, and it
            lands here for your OK.
            {lastRun
              ? ` Last swept the inbox ${new Date(lastRun.created_at).toLocaleDateString([], {
                  weekday: "long",
                })}.`
              : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
