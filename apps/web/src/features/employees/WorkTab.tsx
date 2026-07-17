import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Activity, CalendarClock, CheckCheck, Loader2, Play, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { useApprovals } from "@/features/approvals/hooks";
import { ConnectBanner } from "@/features/integrations/ConnectCta";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { useRunTask, useTasks } from "@/features/tasks/hooks";
import { runsQueryOptions, type Task } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";
import { useActiveTeamId } from "@/features/workspace/active";

import { employeeStatsQueryOptions } from "./queries";
import type { EmployeeMeta } from "./roles";
import { SkillLibraryDialog } from "./SkillLibrary";
import { DutyRow, FeedRow, InboxApprovalRow, StatChip } from "./ui";

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

// What one run of each kind actually does, in shift-plan language.
const KIND_LINE: Record<string, string> = {
  reddit_monitor: "Scan Reddit for new leads and draft replies",
  reddit_post: "Write and queue a community post",
  linkedin_post: "Draft a LinkedIn post",
  facebook_post: "Draft a Facebook post",
  tiktok_slideshow: "Build a TikTok slideshow",
  seo_blog: "Write a complete SEO article",
  content: "Draft content from fresh research",
  email_responder: "Sweep the inbox and draft replies",
  facebook_dm: "Answer Messenger conversations",
};

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

/** "8:00 AM" today, "Mon 7:00 AM" otherwise. */
function clockLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/**
 * Walking in on the employee: a live presence line (working right now vs on
 * duty with what's next), their shift plan (every scheduled run, soonest
 * first, with a do-it-now button), then the finished work. Polls while open
 * so an in-flight run shows up as it happens.
 */
export function WorkTab({ meta, mine }: { meta: EmployeeMeta; mine: Task[] }) {
  const teamId = useActiveTeamId();
  const run = useRunTask();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { refetch: refetchTasks } = useTasks();

  const mineIds = new Set(mine.map((t) => t.id));
  const active = mine.filter((t) => t.status === "active");

  // Poll while the boss is watching, so "working right now" is actually live.
  const { data: runs, isLoading: runsLoading } = useQuery({
    ...runsQueryOptions(teamId),
    refetchInterval: 15_000,
  });
  const { data: stats } = useQuery(employeeStatsQueryOptions(teamId, [...mineIds]));
  const { data: approvals } = useApprovals();
  const { data: leadGroups } = usePendingLeadReplies();

  const myRuns = (runs ?? []).filter((r) => mineIds.has(r.task_id));
  const runningIds = new Set(myRuns.filter((r) => r.status === "running").map((r) => r.task_id));
  const runningRun = myRuns.find((r) => r.status === "running");
  const titleById = new Map(mine.map((t) => [t.id, t.title]));

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const finished24h = myRuns.filter(
    (r) => r.status === "succeeded" && new Date(r.created_at).getTime() >= since,
  ).length;
  const myPending = (approvals ?? []).filter(
    (a) => a.status === "pending" && a.task_id && mineIds.has(a.task_id),
  );
  const myReplyGroups = (leadGroups ?? []).filter((g) => mineIds.has(g.taskId));
  const waiting = myPending.length + myReplyGroups.reduce((s, g) => s + g.count, 0);

  // The shift plan: every scheduled run, soonest first; on-demand skills last.
  const scheduled = active
    .filter((t) => t.next_run_at)
    .sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime());
  const onDemand = active.filter((t) => !t.next_run_at);
  const next = scheduled[0];

  const neededToolkits = [...new Set(active.flatMap((t) => requiredToolkits(t)))];
  const ranTaskIds = new Set(myRuns.map((r) => r.task_id));
  const firstUnrun = active.find((t) => requiredToolkits(t).length > 0 && !ranTaskIds.has(t.id));

  function startNow(taskId: string) {
    run.mutate(taskId, { onSuccess: () => void refetchTasks() });
  }

  return (
    <>
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
                  ? `Next up: ${next.title} · ${clockLabel(next.next_run_at!)} (${inWords(next.next_run_at!)})`
                  : active.length > 0
                    ? "On call: start anything below whenever you like."
                    : "Resume a skill to put them back to work."}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {meta.role === "growth" && <StatChip label="Leads · 24h" value={stats?.leadsFound} />}
            <StatChip label="Done · 24h" value={runsLoading ? undefined : finished24h} />
            {waiting > 0 && (
              <Link to="/approvals" className="block">
                <StatChip label="Waiting for your OK" value={waiting} />
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 empty:hidden">
        <ConnectBanner toolkits={neededToolkits} autoRunTaskId={firstUnrun?.id} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {waiting > 0 && (
            <Card className="self-start">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <CheckCheck className="size-4" /> Waiting for your OK
                  </span>
                  <Link
                    to="/approvals"
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    Open all
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {myReplyGroups.map((g) => (
                  <Link
                    key={g.taskId}
                    to="/agents/$agentId"
                    params={{ agentId: g.taskId }}
                    className="bg-muted/30 hover:border-primary/40 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        <Sparkles className="size-3.5 shrink-0" />
                        {titleById.get(g.taskId) ?? "Reddit leads"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {g.count} repl{g.count === 1 ? "y" : "ies"} drafted and ready to review
                      </p>
                    </div>
                    <span className="text-primary shrink-0 text-sm font-medium">Review</span>
                  </Link>
                ))}
                {myPending.slice(0, 3).map((a) => (
                  <InboxApprovalRow key={a.id} approval={a} />
                ))}
                {myPending.length > 3 && (
                  <Link
                    to="/approvals"
                    className="text-muted-foreground hover:text-foreground block py-1 text-center text-sm"
                  >
                    + {myPending.length - 3} more waiting
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="self-start">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4" /> {meta.name}'s shift plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {scheduled.length === 0 && onDemand.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Nothing scheduled. Teach {meta.name} a skill and it lands here.
                </p>
              ) : (
                <div className="grid gap-2">
                  {[...scheduled, ...onDemand].map((t) => {
                    const isRunning =
                      runningIds.has(t.id) || (run.isPending && run.variables === t.id);
                    return (
                      <div
                        key={t.id}
                        className="bg-muted/30 flex items-center gap-3 rounded-xl border px-3.5 py-3"
                      >
                        <div className="w-24 shrink-0">
                          {t.next_run_at ? (
                            <>
                              <p className="text-sm font-semibold tabular-nums">
                                {clockLabel(t.next_run_at)}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {inWords(t.next_run_at)}
                              </p>
                            </>
                          ) : (
                            <p className="text-muted-foreground text-xs font-medium">On demand</p>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{t.title}</p>
                          <p className="text-muted-foreground truncate text-xs">
                            {KIND_LINE[t.kind ?? ""] ?? "Runs its instructions"}
                          </p>
                        </div>
                        {isRunning ? (
                          <span className="text-primary flex shrink-0 items-center gap-1.5 text-xs font-medium">
                            <Loader2 className="size-3.5 animate-spin" /> Working…
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-primary shrink-0"
                            onClick={() => startNow(t.id)}
                          >
                            <Play className="size-3.5" /> Start now
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {run.isError && (
                <p className="text-destructive mt-2 text-xs">
                  {(run.error as Error)?.message || "Couldn't start that run."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="self-start">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4" /> Finished work
              </CardTitle>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              ) : myRuns.filter((r) => r.status !== "running").length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  Nothing yet. Results land here as soon as {meta.name} runs.
                </p>
              ) : (
                <div className="-mx-2">
                  {myRuns
                    .filter((r) => r.status !== "running")
                    .slice(0, 15)
                    .map((r) => (
                      <FeedRow key={r.id} run={r} title={titleById.get(r.task_id) ?? "Task"} />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="self-start">
            <CardHeader>
              <CardTitle className="text-base">Skills</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {mine.map((t) => (
                <DutyRow key={t.id} task={t} />
              ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-1 w-full"
                onClick={() => setLibraryOpen(true)}
              >
                <Plus className="size-4" /> Teach {meta.name} a new skill
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <SkillLibraryDialog
        meta={meta}
        mine={mine}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
      />
    </>
  );
}
