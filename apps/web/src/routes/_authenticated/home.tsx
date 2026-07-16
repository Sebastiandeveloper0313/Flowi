import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import {
  Activity,
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCheck,
  Loader2,
  Plus,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useState } from "react";

import { useConfirm } from "@/components/useConfirm";
import { useApprovals, useDecideApproval } from "@/features/approvals/hooks";
import type { Approval } from "@/features/approvals/queries";
import { DESK_DRAFT_KEY } from "@/features/chat/Chat";
import { SentriveLogo } from "@/features/dashboard/brand";
import { HirePlan } from "@/features/desk/HirePlan";
import { deskStatsQueryOptions } from "@/features/desk/queries";
import { ConnectBanner } from "@/features/integrations/ConnectCta";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { formatWhen, scheduleLabel, useRuns, useTasks } from "@/features/tasks/hooks";
import type { Task, TaskRun } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";
import { RunDot, runSummaryLine, TaskStatusBadge } from "@/features/tasks/ui";
import { useActiveTeamId } from "@/features/workspace/active";

export const Route = createFileRoute("/_authenticated/home")({
  component: DeskPage,
});

/**
 * The employee's desk, and the app's front door. Everything Sentrive is doing
 * for this business in one place: a composer to hand it work, one feed of
 * finished work, one stack of things waiting on the user, and its current
 * skills. First visit (no agents yet) is the hiring moment instead: Sentrive
 * proposes the work plan it drew up from the user's website.
 */
function DeskPage() {
  const teamId = useActiveTeamId();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: runs, isLoading: runsLoading } = useRuns();
  const { data: stats } = useQuery(deskStatsQueryOptions(teamId));
  const { data: approvals } = useApprovals();
  const { data: leadGroups } = usePendingLeadReplies();

  const active = (tasks ?? []).filter((t) => t.status === "active");
  const pending = (approvals ?? []).filter((a) => a.status === "pending");
  const replyGroups = leadGroups ?? [];
  const replyTotal = replyGroups.reduce((s, g) => s + g.count, 0);
  const waiting = pending.length + replyTotal;

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const recentRuns = (runs ?? []).filter(
    (r) => r.status === "success" && new Date(r.created_at).getTime() >= since,
  ).length;

  const titleById = new Map((tasks ?? []).map((t) => [t.id, t.title]));
  const loading = tasksLoading || runsLoading;
  const firstRun = !tasksLoading && (tasks ?? []).length === 0;

  // Every account the current skills need, surfaced here so "connect Reddit"
  // meets the user where they already are. Auto-run targets the first skill
  // that's never produced anything, so connecting visibly starts real work.
  const neededToolkits = [...new Set(active.flatMap((t) => requiredToolkits(t)))];
  const ranTaskIds = new Set((runs ?? []).map((r) => r.task_id));
  const firstUnrun = active.find((t) => requiredToolkits(t).length > 0 && !ranTaskIds.has(t.id));

  return (
    <div className="flowy-page">
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl border bg-white shadow-xs [&>svg]:size-9">
          <SentriveLogo />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Sentrive</h1>
          <p className="text-muted-foreground text-sm">
            Your marketing employee ·{" "}
            {firstRun
              ? "ready to start"
              : active.length > 0
                ? `on the job with ${active.length} skill${active.length === 1 ? "" : "s"} running`
                : "paused"}
          </p>
        </div>
      </header>

      <DeskComposer />

      {firstRun ? (
        <div className="mt-6">
          <HirePlan />
        </div>
      ) : (
        <>
          <div className="mt-6 mb-4 empty:hidden">
            <ConnectBanner toolkits={neededToolkits} autoRunTaskId={firstUnrun?.id} />
          </div>

          {/* Standup numbers: what happened while you weren't looking. */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={Target} label="Leads found · 24h" value={stats?.leadsFound} />
            <StatTile
              icon={ArrowUpRight}
              label="Replies posted · 24h"
              value={stats?.postedReplies}
            />
            <StatTile
              icon={Activity}
              label="Tasks finished · 24h"
              value={loading ? undefined : recentRuns}
            />
            <StatTile
              icon={CheckCheck}
              label="Waiting on you"
              value={waiting}
              highlight={waiting > 0}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              {waiting > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <CheckCheck className="size-4" /> Waiting for you
                      </span>
                      <Link
                        to="/approvals"
                        className="text-primary text-sm font-medium hover:underline"
                      >
                        Open approvals
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {replyGroups.map((g) => (
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
                    {pending.map((a) => (
                      <InboxApprovalRow key={a.id} approval={a} />
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <Activity className="size-4" /> Recent work
                    </span>
                    <Link
                      to="/activity"
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      Full log
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                      <Loader2 className="size-4 animate-spin" /> Loading…
                    </div>
                  ) : !runs || runs.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                      Nothing yet. Once Sentrive starts working, everything it does shows up here.
                    </p>
                  ) : (
                    <div className="-mx-2">
                      {runs.slice(0, 12).map((run) => (
                        <FeedRow
                          key={run.id}
                          run={run}
                          title={titleById.get(run.task_id) ?? "Task"}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Skills</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tasksLoading ? (
                    <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
                      <Loader2 className="size-4 animate-spin" /> Loading…
                    </div>
                  ) : (
                    (tasks ?? []).map((t) => <SkillRow key={t.id} task={t} />)
                  )}
                  <Button asChild variant="outline" size="sm" className="mt-1 w-full">
                    <Link to="/dashboard" search={{ c: undefined }}>
                      <Plus className="size-4" /> Add a skill
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The desk's composer: type what you need, it lands in chat and Sentrive
 * answers there (the draft rides over in sessionStorage and auto-sends).
 * Chat stays the one conversation surface; the desk is where work shows up.
 */
function DeskComposer() {
  const [text, setText] = useState("");
  const navigate = useNavigate();

  function submit() {
    const t = text.trim();
    if (!t) return;
    try {
      sessionStorage.setItem(DESK_DRAFT_KEY, t);
    } catch {
      /* storage blocked: chat opens empty, nothing lost but the prefill */
    }
    void navigate({ to: "/dashboard", search: { c: undefined } });
  }

  return (
    <div className="bg-card focus-within:border-primary/50 flex items-center gap-2 rounded-2xl border p-2 pl-4 shadow-xs transition">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Tell Sentrive what you need done…"
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      <Button size="sm" className="shrink-0" disabled={!text.trim()} onClick={submit}>
        <ArrowUp className="size-4" /> Send
      </Button>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Target;
  label: string;
  value: number | undefined;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-card rounded-2xl border p-4 shadow-xs ${highlight ? "border-primary/40" : ""}`}
    >
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Icon className="size-3.5" /> {label}
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight">
        {value === undefined ? <span className="text-muted-foreground text-base">…</span> : value}
      </p>
    </div>
  );
}

/**
 * A pending approval as one inbox row: approve or reject right here (with the
 * same confirms as the Approvals page), or click through to edit before
 * approving. Editing stays on /approvals so this stays a fast triage surface.
 */
function InboxApprovalRow({ approval: a }: { approval: Approval }) {
  const decide = useDecideApproval();
  const { confirm, dialog } = useConfirm();
  const busy = decide.isPending && decide.variables?.id === a.id;

  async function onDecide(decision: "approve" | "reject") {
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
    if (ok) decide.mutate({ id: a.id, decision });
  }

  return (
    <div className="bg-muted/30 flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <Link to="/approvals" className="group min-w-0">
        <p className="group-hover:text-primary truncate text-sm font-medium">{a.title}</p>
        <p className="text-muted-foreground truncate text-xs">
          {a.agent_title ?? "From chat"} · {formatWhen(a.created_at)}
        </p>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" className="h-8" disabled={busy} onClick={() => void onDecide("approve")}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground h-8"
          disabled={busy}
          onClick={() => void onDecide("reject")}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {dialog}
    </div>
  );
}

function FeedRow({ run, title }: { run: TaskRun; title: string }) {
  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: run.task_id }}
      className="hover:bg-muted/40 flex items-center gap-3 rounded-lg px-2 py-2.5 transition"
    >
      <RunDot status={run.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-muted-foreground truncate text-xs">{runSummaryLine(run)}</p>
      </div>
      <span className="text-muted-foreground shrink-0 text-xs">{formatWhen(run.created_at)}</span>
    </Link>
  );
}

function SkillRow({ task }: { task: Task }) {
  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: task.id }}
      className="bg-muted/30 hover:border-primary/40 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 transition"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="text-muted-foreground text-xs">{scheduleLabel(task.schedule_cron)}</p>
      </div>
      <TaskStatusBadge status={task.status} />
    </Link>
  );
}
