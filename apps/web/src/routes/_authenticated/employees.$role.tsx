import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Activity, ArrowLeft, CheckCheck, Loader2, Plus, Sparkles } from "lucide-react";

import { useApprovals } from "@/features/approvals/hooks";
import { SentriveLogo } from "@/features/dashboard/brand";
import { HirePlan } from "@/features/employees/HirePlan";
import { employeeStatsQueryOptions } from "@/features/employees/queries";
import { employeeMeta, tasksOfRole, type EmployeeRole } from "@/features/employees/roles";
import { SupportHire } from "@/features/employees/SupportHire";
import { DutyRow, FeedRow, InboxApprovalRow, StatChip } from "@/features/employees/ui";
import { ConnectBanner } from "@/features/integrations/ConnectCta";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { useRuns, useTasks } from "@/features/tasks/hooks";
import { requiredToolkits } from "@/features/tasks/requirements";
import { useActiveTeamId } from "@/features/workspace/active";

export const Route = createFileRoute("/_authenticated/employees/$role")({
  params: {
    parse: (p) => {
      if (p.role !== "marketing" && p.role !== "support") throw notFound();
      return { role: p.role as EmployeeRole };
    },
  },
  component: EmployeePage,
});

/**
 * One employee, one page: everything this role is doing for the business.
 * Its feed, what it's waiting on you for, its duties (the agents inside it),
 * and the accounts it works through. If the role isn't hired yet, this page
 * IS the hiring moment.
 */
function EmployeePage() {
  const { role } = Route.useParams();
  const meta = employeeMeta(role);
  const teamId = useActiveTeamId();

  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: runs, isLoading: runsLoading } = useRuns();
  const { data: approvals } = useApprovals();
  const { data: leadGroups } = usePendingLeadReplies();

  const mine = tasksOfRole(tasks ?? [], role);
  const mineIds = new Set(mine.map((t) => t.id));
  const active = mine.filter((t) => t.status === "active");

  const { data: stats } = useQuery(employeeStatsQueryOptions(teamId, [...mineIds]));

  const myRuns = (runs ?? []).filter((r) => mineIds.has(r.task_id));
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const finished24h = myRuns.filter(
    (r) => r.status === "success" && new Date(r.created_at).getTime() >= since,
  ).length;

  const pending = (approvals ?? []).filter(
    (a) => a.status === "pending" && a.task_id && mineIds.has(a.task_id),
  );
  const replyGroups = (leadGroups ?? []).filter((g) => mineIds.has(g.taskId));
  const replyTotal = replyGroups.reduce((s, g) => s + g.count, 0);
  const waiting = pending.length + replyTotal;

  const titleById = new Map(mine.map((t) => [t.id, t.title]));
  const neededToolkits = [...new Set(active.flatMap((t) => requiredToolkits(t)))];
  const ranTaskIds = new Set(myRuns.map((r) => r.task_id));
  const firstUnrun = active.find((t) => requiredToolkits(t).length > 0 && !ranTaskIds.has(t.id));

  const hired = !tasksLoading && mine.length > 0;
  const loading = tasksLoading || runsLoading;

  return (
    <div className="flowy-page">
      <Link
        to="/home"
        className="text-muted-foreground hover:text-foreground mb-5 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Your team
      </Link>

      <header className="mb-6 flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl border bg-white shadow-xs [&>svg]:size-9">
          <SentriveLogo />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
          <p className="text-muted-foreground text-sm">
            {hired
              ? `${meta.blurb} ${active.length} dut${active.length === 1 ? "y" : "ies"} on its schedule.`
              : meta.blurb}
          </p>
        </div>
        {hired && (
          <div className="flex gap-2">
            {role === "marketing" && <StatChip label="Leads · 24h" value={stats?.leadsFound} />}
            <StatChip label="Done · 24h" value={loading ? undefined : finished24h} />
            <StatChip label="Waiting on you" value={waiting} />
          </div>
        )}
      </header>

      {tasksLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : !hired ? (
        role === "marketing" ? (
          <HirePlan />
        ) : (
          <SupportHire />
        )
      ) : (
        <>
          <div className="mb-4 empty:hidden">
            <ConnectBanner toolkits={neededToolkits} autoRunTaskId={firstUnrun?.id} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              {waiting > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CheckCheck className="size-4" /> Waiting for you
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
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="size-4" /> Its work
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                      <Loader2 className="size-4 animate-spin" /> Loading…
                    </div>
                  ) : myRuns.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                      Nothing yet. Results land here as soon as it runs.
                    </p>
                  ) : (
                    <div className="-mx-2">
                      {myRuns.slice(0, 15).map((run) => (
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
                  <CardTitle className="text-base">Duties</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {mine.map((t) => (
                    <DutyRow key={t.id} task={t} />
                  ))}
                  <Button asChild variant="outline" size="sm" className="mt-1 w-full">
                    <Link to="/dashboard" search={{ c: undefined }}>
                      <Plus className="size-4" /> Add a duty in chat
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
