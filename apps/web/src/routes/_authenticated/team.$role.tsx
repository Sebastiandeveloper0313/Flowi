import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Activity, ArrowLeft, Loader2, Plus } from "lucide-react";

import { useApprovals } from "@/features/approvals/hooks";
import { HirePlan } from "@/features/employees/HirePlan";
import { employeeStatsQueryOptions } from "@/features/employees/queries";
import { employeeMeta, tasksOfRole, type EmployeeRole } from "@/features/employees/roles";
import { SupportHire } from "@/features/employees/SupportHire";
import { DutyRow, FeedRow, StatChip } from "@/features/employees/ui";
import { ConnectBanner } from "@/features/integrations/ConnectCta";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { useRuns, useTasks } from "@/features/tasks/hooks";
import { requiredToolkits } from "@/features/tasks/requirements";
import { useActiveTeamId } from "@/features/workspace/active";

export const Route = createFileRoute("/_authenticated/team/$role")({
  params: {
    parse: (p) => {
      if (p.role !== "marketing" && p.role !== "support") throw notFound();
      return { role: p.role as EmployeeRole };
    },
  },
  component: EmployeePage,
});

/**
 * One employee's page: who they are, the agents working inside them, and the
 * work they've delivered. Anything waiting on the user lives on Approvals; the
 * header just counts it. An unhired employee's page IS the hiring moment.
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
    (r) => r.status === "succeeded" && new Date(r.created_at).getTime() >= since,
  ).length;

  const waiting =
    (approvals ?? []).filter((a) => a.status === "pending" && a.task_id && mineIds.has(a.task_id))
      .length +
    (leadGroups ?? []).filter((g) => mineIds.has(g.taskId)).reduce((s, g) => s + g.count, 0);

  const titleById = new Map(mine.map((t) => [t.id, t.title]));
  const neededToolkits = [...new Set(active.flatMap((t) => requiredToolkits(t)))];
  const ranTaskIds = new Set(myRuns.map((r) => r.task_id));
  const firstUnrun = active.find((t) => requiredToolkits(t).length > 0 && !ranTaskIds.has(t.id));

  const hired = !tasksLoading && mine.length > 0;
  const loading = tasksLoading || runsLoading;

  return (
    <div className="flowy-page">
      <Link
        to="/team"
        className="text-muted-foreground hover:text-foreground mb-5 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Your team
      </Link>

      <header className="mb-6 flex flex-wrap items-center gap-4">
        <span
          className={`grid size-14 shrink-0 place-items-center rounded-2xl text-3xl shadow-xs ${meta.tint}`}
        >
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{meta.name}</h1>
          <p className="text-muted-foreground text-sm">
            {meta.title} · {meta.blurb}
          </p>
        </div>
        {hired && (
          <div className="flex gap-2">
            {role === "marketing" && <StatChip label="Leads · 24h" value={stats?.leadsFound} />}
            <StatChip label="Done · 24h" value={loading ? undefined : finished24h} />
            {waiting > 0 && (
              <Link to="/approvals" className="block">
                <StatChip label="Waiting for your OK" value={waiting} />
              </Link>
            )}
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
            <Card className="self-start">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4" /> {meta.name}'s work
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                    <Loader2 className="size-4 animate-spin" /> Loading…
                  </div>
                ) : myRuns.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    Nothing yet. Results land here as soon as {meta.name} runs.
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

            <Card className="self-start">
              <CardHeader>
                <CardTitle className="text-base">Agents inside</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {mine.map((t) => (
                  <DutyRow key={t.id} task={t} />
                ))}
                <Button asChild variant="outline" size="sm" className="mt-1 w-full">
                  <Link to="/dashboard" search={{ c: undefined }}>
                    <Plus className="size-4" /> Add one in chat
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
