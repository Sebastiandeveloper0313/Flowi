import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Activity, CalendarClock, CheckCheck, Loader2, Pause, Play, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useApprovals } from "@/features/approvals/hooks";
import { DESK_DRAFT_KEY } from "@/features/chat/Chat";
import { ConnectBanner } from "@/features/integrations/ConnectCta";
import { DraftApprovalCard } from "@/features/posts/DraftApprovalCard";
import {
  nextFireLocal,
  SCHEDULES,
  scheduleLabel,
  useRunTask,
  useSetTaskStatus,
  useTasks,
  useUpdateTaskAutonomy,
  useUpdateTaskSchedule,
} from "@/features/tasks/hooks";
import { runsQueryOptions, type Task } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";
import { useActiveTeamId } from "@/features/workspace/active";
import { useUpdateAutoPostPacing, useWorkspace } from "@/features/workspace/hooks";

import { buildWorkItems, LeadReplyCard, WorkItemRow } from "./Deliverables";
import { EmployeeAvatar } from "./EmployeeAvatar";
import { employeeDeliverablesQueryOptions } from "./queries";
import { kindLine, type EmployeeMeta } from "./roles";
import { RoleWorkspace } from "./RoleWorkspace";
import { SkillLibraryDialog } from "./SkillLibrary";
import { InboxApprovalRow, StatChip } from "./ui";

// The real pipeline each kind walks through, narrated. While a run is in
// flight the presence line cycles through these, so watching the employee
// work shows the actual stages of the job (order is true; timing is paced).
const KIND_STAGES: Record<string, string[]> = {
  reddit_monitor: [
    "Reading fresh posts in the target subreddits…",
    "Scoring each thread against what a dream lead looks like…",
    "Writing draft replies for the best matches…",
    "Saving the new leads for your review…",
  ],
  reddit_post: [
    "Reading the community's rules and recent vibe…",
    "Writing a value-first post…",
    "Queuing it up for your approval…",
  ],
  linkedin_post: [
    "Reviewing your voice and recent angles…",
    "Drafting the LinkedIn post…",
    "Preparing it for your approval…",
  ],
  facebook_post: [
    "Reviewing your voice and recent angles…",
    "Drafting the Facebook post…",
    "Preparing it for your approval…",
  ],
  tiktok_slideshow: ["Writing the slide copy…", "Rendering slides over your images…"],
  seo_blog: [
    "Picking a topic your customers actually search for…",
    "Researching it with live web search…",
    "Writing the article: title, meta description, body…",
    "Delivering it to your blog…",
  ],
  content: [
    "Researching with live web search…",
    "Drafting the content…",
    "Polishing the tone against your business profile…",
  ],
  email_responder: [
    "Sweeping the inbox for real messages…",
    "Drafting replies in your voice…",
    "Queuing them for your OK…",
  ],
  facebook_dm: ["Reading new conversations…", "Drafting replies…"],
};

/** Cycles through the running kind's real pipeline stages while in flight. */
function RunningStage({ kind, runId }: { kind: string; runId: string }) {
  const stages = KIND_STAGES[kind] ?? ["Working through the task…"];
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const t = setInterval(() => setI((v) => (v + 1) % stages.length), 6000);
    return () => clearInterval(t);
  }, [runId, stages.length]);
  return (
    <span className="animate-in fade-in-0 inline-flex items-center gap-2 duration-500" key={i}>
      <Loader2 className="text-primary size-3.5 animate-spin" />
      {stages[i]}
    </span>
  );
}

/** "in 4 min" / "in 3 h" / "in 2 d", from an ISO timestamp. */
function inWords(iso: string): string {
  const d = new Date(iso).getTime() - Date.now();
  if (d <= 60_000) return "any moment now";
  const m = Math.round(d / 60_000);
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h} h`;
  return `in ${Math.round(h / 24)} d`;
}

/** "a", "a and b", "a, b, and c". */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * The employee's own standup, written from their real last-24h numbers. Two
 * sentences max: what got done, then what they need (or when they're back).
 */
function standupLine(c: {
  leads24: number;
  replies24: number;
  published24: number;
  articles24: number;
  done24: number;
  waiting: number;
  nextAt?: string;
}): string {
  const bits: string[] = [];
  if (c.leads24 > 0) bits.push(`found ${c.leads24} new lead${c.leads24 === 1 ? "" : "s"}`);
  if (c.replies24 > 0) bits.push(`posted ${c.replies24} repl${c.replies24 === 1 ? "y" : "ies"}`);
  if (c.published24 > 0)
    bits.push(`published ${c.published24} post${c.published24 === 1 ? "" : "s"}`);
  if (c.articles24 > 0)
    bits.push(`delivered ${c.articles24} article${c.articles24 === 1 ? "" : "s"}`);
  if (bits.length === 0 && c.done24 > 0)
    bits.push(`finished ${c.done24} task${c.done24 === 1 ? "" : "s"}`);

  const head =
    bits.length > 0
      ? `Since yesterday I ${joinAnd(bits)}.`
      : "Quiet shift so far: nothing new since yesterday.";
  if (c.waiting > 0)
    return `${head} ${c.waiting === 1 ? "One thing is" : `${c.waiting} things are`} waiting on your OK.`;
  if (c.nextAt) return `${head} Back on it at ${c.nextAt}.`;
  return head;
}

/**
 * When this agent next runs. The scheduler arms next_run_at on its own sweep,
 * so until it does, project the cadence locally instead of calling a scheduled
 * agent "on demand".
 */
export function nextRunOf(t: Task): string | null {
  if (t.next_run_at) return t.next_run_at;
  if (t.status !== "active") return null;
  return nextFireLocal(t.schedule_cron)?.toISOString() ?? null;
}

/** "8:00 AM" today, "Mon 7:00 AM" otherwise. */
function clockLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/**
 * The schedule in the USER's clock. An agent scheduled in another timezone
 * would show "8 AM" while running at the user's 10 AM; since next_run_at is
 * the ground truth of when it actually fires, re-express fixed-time cadences
 * with that local time so the label and the next-run column always agree.
 */
export function localScheduleLabel(t: Task): string {
  const cron = t.schedule_cron;
  if (!cron) return scheduleLabel(null);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!t.timezone || t.timezone === browserTz || !t.next_run_at) return scheduleLabel(cron);

  const parts = cron.trim().split(/\s+/);
  const fallback = `${scheduleLabel(cron)} (${t.timezone})`;
  if (parts.length !== 5) return fallback;
  const [m, h, dom, , dow] = parts;
  if (!/^\d+$/.test(m) || !/^\d+$/.test(h)) return fallback; // not a fixed clock time

  const local = new Date(t.next_run_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (dom === "*" && dow === "*") return `Every day at ${local}`;
  if (dom === "*" && dow === "1-5") return `Every weekday at ${local}`;
  if (dom === "*" && /^\d$/.test(dow)) {
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `Every ${names[Number(dow)]} at ${local}`;
  }
  return fallback;
}

/**
 * Walking in on the employee: a live presence line (working right now vs on
 * duty with what's next), their shift plan (every scheduled run, soonest
 * first, with a do-it-now button), then the finished work. Polls while open
 * so an in-flight run shows up as it happens.
 */
export function WorkTab({
  meta,
  mine,
  onOpenChat,
}: {
  meta: EmployeeMeta;
  mine: Task[];
  onOpenChat: () => void;
}) {
  const teamId = useActiveTeamId();
  const run = useRunTask();
  const setAutonomy = useUpdateTaskAutonomy();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showAllWaiting, setShowAllWaiting] = useState(false);
  const { refetch: refetchTasks } = useTasks();

  // Employee-level autonomy: Auto only when every skill is explicitly auto;
  // switching sets every skill so the whole employee behaves one way.
  const allAuto = mine.length > 0 && mine.every((t) => t.autonomy_mode === "auto");
  function setEmployeeAutonomy(mode: "ask" | "auto") {
    for (const t of mine) setAutonomy.mutate({ id: t.id, mode });
  }

  // "Teach something custom" hands the brief to the employee's chat, which
  // sets it up as a real agent (same draft handoff the desk composer used).
  function teachCustom(text: string) {
    try {
      sessionStorage.setItem(
        DESK_DRAFT_KEY,
        `Set this up as one of your recurring skills: ${text}`,
      );
    } catch {
      /* storage blocked: chat opens empty, nothing lost but the prefill */
    }
    setLibraryOpen(false);
    onOpenChat();
  }

  const mineIds = new Set(mine.map((t) => t.id));
  const active = mine.filter((t) => t.status === "active");

  // Poll while the boss is watching, so "working right now" is actually live.
  const { data: runs, isLoading: runsLoading } = useQuery({
    ...runsQueryOptions(teamId),
    refetchInterval: 15_000,
  });
  const { data: deliverables } = useQuery(employeeDeliverablesQueryOptions(teamId, [...mineIds]));
  const { data: approvals } = useApprovals();

  const myRuns = (runs ?? []).filter((r) => mineIds.has(r.task_id));
  const runningIds = new Set(myRuns.filter((r) => r.status === "running").map((r) => r.task_id));
  const runningRun = myRuns.find((r) => r.status === "running");
  const titleById = new Map(mine.map((t) => [t.id, t.title]));

  const myPending = (approvals ?? []).filter(
    (a) => a.status === "pending" && a.task_id && mineIds.has(a.task_id),
  );
  // Reply drafts still waiting on the boss, reviewable right here.
  const pendingLeads = (deliverables?.leads ?? []).filter(
    (l) => l.status === "new" && (l.draft_reply ?? "").trim() !== "",
  );
  // Posts this employee wrote that nothing will publish without a click. On
  // Ask first that is every post, so they belong in the same queue.
  const pendingDrafts = (deliverables?.drafts ?? []).filter(
    (d) => d.status !== "posted" && d.status !== "queued" && d.status !== "dismissed",
  );
  const waiting = myPending.length + pendingLeads.length + pendingDrafts.length;

  // The week in outcomes, not activity: what actually got made and shipped.
  const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const leads7 = (deliverables?.leads ?? []).filter(
    (l) => new Date(l.created_at).getTime() >= week,
  ).length;
  const replies7 = (deliverables?.leads ?? []).filter(
    (l) => l.status === "posted" && new Date(l.updated_at).getTime() >= week,
  ).length;
  const published7 = (deliverables?.drafts ?? []).filter(
    (d) => d.status === "posted" && new Date(d.updated_at).getTime() >= week,
  ).length;
  const seoIds = new Set(mine.filter((t) => t.kind === "seo_blog").map((t) => t.id));
  const articles7 = myRuns.filter(
    (r) =>
      r.status === "succeeded" && seoIds.has(r.task_id) && new Date(r.created_at).getTime() >= week,
  ).length;
  const done7 = myRuns.filter(
    (r) => r.status === "succeeded" && new Date(r.created_at).getTime() >= week,
  ).length;

  // Yesterday's shift, for the standup bubble.
  const day = Date.now() - 24 * 60 * 60 * 1000;
  const leads24 = (deliverables?.leads ?? []).filter(
    (l) => new Date(l.created_at).getTime() >= day,
  ).length;
  const replies24 = (deliverables?.leads ?? []).filter(
    (l) => l.status === "posted" && new Date(l.updated_at).getTime() >= day,
  ).length;
  const published24 = (deliverables?.drafts ?? []).filter(
    (d) => d.status === "posted" && new Date(d.updated_at).getTime() >= day,
  ).length;
  const articles24 = myRuns.filter(
    (r) =>
      r.status === "succeeded" && seoIds.has(r.task_id) && new Date(r.created_at).getTime() >= day,
  ).length;
  const done24 = myRuns.filter(
    (r) => r.status === "succeeded" && new Date(r.created_at).getTime() >= day,
  ).length;
  const workItems = buildWorkItems({
    leads: (deliverables?.leads ?? []).filter((l) => l.status !== "new"),
    drafts: deliverables?.drafts ?? [],
    runs: myRuns,
    tasks: mine,
  });

  // The shift plan: every scheduled run, soonest first; on-demand skills last.
  const scheduled = active
    .filter((t) => nextRunOf(t))
    .sort((a, b) => new Date(nextRunOf(a)!).getTime() - new Date(nextRunOf(b)!).getTime());
  const onDemand = active.filter((t) => !nextRunOf(t));
  const pausedTasks = mine.filter((t) => t.status === "paused");
  const next = scheduled[0];

  const standup = standupLine({
    leads24,
    replies24,
    published24,
    articles24,
    done24,
    waiting,
    nextAt: next && nextRunOf(next) ? clockLabel(nextRunOf(next)!) : undefined,
  });

  const neededToolkits = [...new Set(active.flatMap((t) => requiredToolkits(t)))];
  const ranTaskIds = new Set(myRuns.map((r) => r.task_id));
  const firstUnrun = active.find((t) => requiredToolkits(t).length > 0 && !ranTaskIds.has(t.id));

  function startNow(taskId: string) {
    run.mutate(taskId, { onSuccess: () => void refetchTasks() });
  }

  // An employee with no agents runs nothing at all. Say that plainly and give
  // the two ways to fix it, instead of a calm presence card that implies work
  // is happening.
  if (mine.length === 0) {
    return (
      <>
        <div className="bg-card rounded-2xl border p-8 text-center shadow-xs">
          <EmployeeAvatar meta={meta} className="mx-auto mb-4 size-16 rounded-2xl text-3xl" />
          <p className="text-lg font-semibold">{meta.name} has nothing to manage yet</p>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">
            The work happens in agents. Give {meta.name} one and they run it on its schedule, report
            what got done, and answer for it here, so you never open it yourself.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => setLibraryOpen(true)}>
              <Plus className="size-4" /> Add an agent
            </Button>
            <Button variant="outline" onClick={onOpenChat}>
              Tell {meta.name} what to do
            </Button>
          </div>
        </div>

        <SkillLibraryDialog
          meta={meta}
          mine={mine}
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          onCustom={teachCustom}
        />
      </>
    );
  }

  return (
    <>
      {/* The standup: the employee reports in, in their own words. */}
      <div className="mb-5 flex items-end gap-3">
        <EmployeeAvatar meta={meta} className="size-10 shrink-0 rounded-full text-lg" />
        <div className="bg-card rounded-2xl rounded-bl-md border px-4 py-3 shadow-xs">
          <p className="text-sm">{standup}</p>
        </div>
      </div>

      {/* Presence: is she working as we speak? */}
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <span className="relative flex size-3 shrink-0">
            {runningRun && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            )}
            <span
              className={`relative inline-flex size-3 rounded-full ${
                runningRun
                  ? "bg-emerald-500"
                  : active.length > 0
                    ? "bg-[#1566e6]"
                    : "bg-muted-foreground/40"
              }`}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {runningRun
                ? `${meta.name} is working right now`
                : active.length > 0
                  ? `${meta.name} is on duty`
                  : mine.length === 0
                    ? `${meta.name} is ready`
                    : `${meta.name} is paused`}
            </p>
            {runningRun ? (
              <p className="text-muted-foreground text-sm">
                <span className="text-foreground font-medium">
                  {titleById.get(runningRun.task_id) ?? "A skill"}
                </span>
                {" · "}
                <RunningStage
                  kind={mine.find((t) => t.id === runningRun.task_id)?.kind ?? ""}
                  runId={runningRun.id}
                />
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {next
                  ? `Next up: ${next.title} · ${clockLabel(nextRunOf(next)!)} (${inWords(nextRunOf(next)!)})`
                  : active.length > 0
                    ? "On call: start anything below whenever you like."
                    : mine.length === 0
                      ? "No agents yet. Add one below, or describe the job in chat."
                      : "Resume a skill to put them back to work."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {meta.role === "growth" && (
              <StatChip label="Leads found · 7d" value={deliverables ? leads7 : undefined} />
            )}
            {meta.role === "growth" && (
              <StatChip label="Replies posted · 7d" value={deliverables ? replies7 : undefined} />
            )}
            {meta.role === "social" && (
              <StatChip label="Published · 7d" value={deliverables ? published7 : undefined} />
            )}
            {meta.role === "content" && (
              <StatChip label="Articles · 7d" value={runsLoading ? undefined : articles7} />
            )}
            <StatChip label="Done · 7d" value={runsLoading ? undefined : done7} />
            {waiting > 0 && (
              <Link to="/approvals" className="block">
                <StatChip label="Waiting for your OK" value={waiting} />
              </Link>
            )}
            {/* Employee-level autonomy, always visible where you check on them. */}
            <div className="flex flex-col items-center gap-1 pl-1">
              <div className="bg-muted/50 flex rounded-full border p-0.5">
                <button
                  type="button"
                  onClick={() => setEmployeeAutonomy("ask")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    !allAuto ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                  }`}
                >
                  Ask first
                </button>
                <button
                  type="button"
                  onClick={() => setEmployeeAutonomy("auto")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    allAuto ? "bg-card text-emerald-700 shadow-xs" : "text-muted-foreground"
                  }`}
                >
                  Auto
                </button>
              </div>
              <p className="text-muted-foreground text-[11px]">
                {allAuto ? `${meta.name} acts without asking` : "Everything waits for your OK"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 empty:hidden">
        <ConnectBanner toolkits={neededToolkits} autoRunTaskId={firstUnrun?.id} />
      </div>

      {/* The trade's own workspace: a calendar for social, a pipeline for
          growth, a shelf for content. Filled by their agents, not by hand. */}
      <RoleWorkspace
        meta={meta}
        mine={mine}
        deliverables={deliverables}
        runs={myRuns}
        approvals={approvals}
        onOpenChat={onOpenChat}
      />

      {/* One column, the boss's questions in order: what needs me, the
          schedule (with its dials, and where new skills get taught), then the
          record. No side rail: the shift plan IS the skill list. */}
      <div className="space-y-5">
        {waiting > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <CheckCheck className="size-4" /> Waiting for your OK
                </span>
                <Link to="/approvals" className="text-primary text-sm font-medium hover:underline">
                  Open all
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!allAuto && (
                <p className="text-muted-foreground text-xs">
                  {meta.name} is on Ask first, so none of this goes out until you say so.
                </p>
              )}
              {pendingDrafts.slice(0, showAllWaiting ? undefined : 3).map((d) => (
                <DraftApprovalCard
                  key={d.id}
                  draft={d}
                  agentTitle={titleById.get(d.task_id ?? "")}
                  compact
                />
              ))}
              {pendingLeads.slice(0, showAllWaiting ? undefined : 3).map((l) => (
                <LeadReplyCard key={l.id} lead={l} />
              ))}
              {myPending.slice(0, showAllWaiting ? undefined : 3).map((a) => (
                <InboxApprovalRow key={a.id} approval={a} />
              ))}
              {(pendingLeads.length > 3 || myPending.length > 3 || pendingDrafts.length > 3) && (
                <button
                  type="button"
                  onClick={() => setShowAllWaiting((v) => !v)}
                  className="text-muted-foreground hover:text-foreground block w-full py-1 text-center text-sm font-medium"
                >
                  {showAllWaiting ? "Show fewer" : `Show all ${waiting} waiting`}
                </button>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <CalendarClock className="size-4" /> {meta.name}'s schedule
              </span>
              <Button size="sm" variant="outline" onClick={() => setLibraryOpen(true)}>
                <Plus className="size-3.5" /> Add an agent
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mine.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nothing scheduled. Add an agent and it lands here.
              </p>
            ) : (
              <div className="grid gap-2">
                {[...scheduled, ...onDemand, ...pausedTasks].map((t) => (
                  <ShiftRow
                    key={t.id}
                    task={t}
                    isRunning={runningIds.has(t.id) || (run.isPending && run.variables === t.id)}
                    onStartNow={() => startNow(t.id)}
                  />
                ))}
              </div>
            )}
            {run.isError && (
              <p className="text-destructive mt-2 text-xs">
                {(run.error as Error)?.message || "Couldn't start that run."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" /> {meta.name}'s work
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runsLoading && workItems.length === 0 ? (
              <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : workItems.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Nothing yet. Everything {meta.name} makes lands here: replies, posts, articles.
              </p>
            ) : (
              <div className="-mx-2">
                {workItems.slice(0, 12).map((item) => (
                  <WorkItemRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <SkillLibraryDialog
        meta={meta}
        mine={mine}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onCustom={teachCustom}
      />
    </>
  );
}

/**
 * One row of the shift plan, with the controls that make it feel like a real
 * schedule you own: when it runs (preset picker, applies from the next run),
 * how much it's allowed to send (Reddit replies/day, workspace-wide), pause
 * and resume without leaving the page, and start-now.
 */
function ShiftRow({
  task: t,
  isRunning,
  onStartNow,
}: {
  task: Task;
  isRunning: boolean;
  onStartNow: () => void;
}) {
  const setStatus = useSetTaskStatus();
  const setSchedule = useUpdateTaskSchedule();
  const pacing = useUpdateAutoPostPacing();
  const { data: ws } = useWorkspace();
  const paused = t.status === "paused";

  const cron = t.schedule_cron ?? "once";
  // The current schedule always renders in the user's own clock (derived from
  // next_run_at), so this label and the next-run column never contradict.
  const currentOption = { value: cron, label: localScheduleLabel(t) };
  const scheduleOptions = [currentOption, ...SCHEDULES.filter((s) => s.value !== cron)];

  const perDay = ws?.auto_post_per_day ?? 10;
  const nextAt = nextRunOf(t);

  return (
    <div className={`bg-muted/30 rounded-xl border px-3.5 py-3 ${paused ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="w-24 shrink-0">
          {paused ? (
            <p className="text-muted-foreground text-xs font-medium">Paused</p>
          ) : nextAt ? (
            <>
              <p className="text-sm font-semibold tabular-nums">{clockLabel(nextAt)}</p>
              <p className="text-muted-foreground text-xs">{inWords(nextAt)}</p>
            </>
          ) : (
            <p className="text-muted-foreground text-xs font-medium">On demand</p>
          )}
        </div>
        <Link
          to="/agents/$agentId"
          params={{ agentId: t.id }}
          className="group min-w-0 flex-1"
          title="Open this skill: full instructions, targeting, delivery"
        >
          <p className="group-hover:text-primary truncate text-sm font-medium transition">
            {t.title}
          </p>
          <p className="text-muted-foreground truncate text-xs">{kindLine(t.kind)}</p>
        </Link>
        {isRunning ? (
          <span className="text-primary flex shrink-0 items-center gap-1.5 text-xs font-medium">
            <Loader2 className="size-3.5 animate-spin" /> Working…
          </span>
        ) : paused ? (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: t.id, status: "active" })}
          >
            <Play className="size-3.5" /> Resume
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-primary shrink-0"
            onClick={onStartNow}
          >
            <Play className="size-3.5" /> Start now
          </Button>
        )}
      </div>

      {/* the dials: schedule, volume cap, pause */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5">
        <Select
          value={cron}
          onValueChange={(v) =>
            setSchedule.mutate({ id: t.id, scheduleCron: v === "once" ? null : v })
          }
        >
          <SelectTrigger size="sm" className="bg-card h-8 w-auto gap-1.5 text-xs">
            <CalendarClock className="size-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scheduleOptions.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {t.kind === "reddit_monitor" && (
          <Select
            value={String(perDay)}
            onValueChange={(v) =>
              ws &&
              pacing.mutate({
                teamId: ws.id,
                perDay: Number(v),
                gapMinutes: ws.auto_post_gap_minutes ?? 45,
              })
            }
          >
            <SelectTrigger size="sm" className="bg-card h-8 w-auto gap-1.5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([3, 5, 10, 15, 20, perDay])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">
                    max {n} replies/day
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}

        <Link
          to="/agents/$agentId"
          params={{ agentId: t.id }}
          className="text-muted-foreground hover:text-primary text-xs font-medium"
        >
          Full settings
        </Link>

        {!paused && (
          <button
            type="button"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: t.id, status: "paused" })}
            className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs font-medium"
          >
            <Pause className="size-3" /> Pause
          </button>
        )}
      </div>
    </div>
  );
}
