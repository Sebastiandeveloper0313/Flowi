import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Activity, ArrowLeft, Loader2, MessageSquare, Plus, Settings2 } from "lucide-react";
import { useState } from "react";

import { useApprovals } from "@/features/approvals/hooks";
import { EmployeeChat } from "@/features/employees/EmployeeChat";
import { EmployeeSettings } from "@/features/employees/EmployeeSettings";
import { employeeStatsQueryOptions } from "@/features/employees/queries";
import { RoleHire } from "@/features/employees/RoleHire";
import {
  employeeMeta,
  HIREABLE_ROLES,
  tasksOfRole,
  type EmployeeRole,
} from "@/features/employees/roles";
import { SkillLibraryDialog } from "@/features/employees/SkillLibrary";
import { DutyRow, FeedRow, StatChip } from "@/features/employees/ui";
import { ConnectBanner } from "@/features/integrations/ConnectCta";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { useRuns, useTasks } from "@/features/tasks/hooks";
import { requiredToolkits } from "@/features/tasks/requirements";
import { useActiveTeamId } from "@/features/workspace/active";

export const Route = createFileRoute("/_authenticated/team/$role")({
  params: {
    parse: (p) => {
      if (!HIREABLE_ROLES.includes(p.role as EmployeeRole)) throw notFound();
      return { role: p.role as EmployeeRole };
    },
  },
  component: EmployeePage,
});

type Tab = "work" | "chat" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "work", label: "Work", icon: Activity },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "settings", label: "Settings", icon: Settings2 },
];

/**
 * One employee's workspace: Work (what they delivered, the agents inside),
 * Chat (their direct line, where you assign things), and Settings (the
 * accounts they work through, each agent's schedule). Anything waiting on the
 * user lives on Approvals; the header just counts it. An unhired employee's
 * page IS the hiring moment.
 */
function EmployeePage() {
  const { role } = Route.useParams();
  const meta = employeeMeta(role);
  const teamId = useActiveTeamId();
  const [tab, setTab] = useState<Tab>("work");
  const [libraryOpen, setLibraryOpen] = useState(false);

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
      {/* One minimal bar: back on the left, the employee and their tabs as a
          single floating pill in the center, pending count on the right. All
          the old header bulk (big avatar, blurb, stat chips) lives in the Work
          tab now, so Chat gets nearly the whole screen. */}
      <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Link
          to="/team"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 justify-self-start text-sm"
        >
          <ArrowLeft className="size-4" /> Your team
        </Link>

        <div className="bg-card flex items-center gap-1 rounded-full border p-1 shadow-xs">
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-full text-sm ${meta.tint}`}
          >
            {meta.emoji}
          </span>
          <span className="px-1.5 text-sm font-semibold">{meta.name}</span>
          {hired && (
            <>
              <span className="bg-border mx-1 h-4 w-px" />
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    tab === id
                      ? "bg-[#eef4fd] text-[#1566e6]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </>
          )}
        </div>

        <span className="justify-self-end">
          {hired && waiting > 0 && (
            <Link
              to="/approvals"
              className="text-primary bg-primary/5 hover:bg-primary/10 rounded-full px-3 py-1.5 text-sm font-medium transition"
            >
              {waiting} waiting
            </Link>
          )}
        </span>
      </div>

      {tasksLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : !hired ? (
        <RoleHire meta={meta} />
      ) : (
        <>
          {tab === "chat" ? (
            <EmployeeChat meta={meta} />
          ) : tab === "settings" ? (
            <EmployeeSettings meta={meta} mine={mine} />
          ) : (
            <>
              {/* The numbers that used to crowd the header. */}
              <div className="mb-5 flex flex-wrap gap-2">
                {role === "growth" && <StatChip label="Leads · 24h" value={stats?.leadsFound} />}
                <StatChip label="Done · 24h" value={loading ? undefined : finished24h} />
                {waiting > 0 && (
                  <Link to="/approvals" className="block">
                    <StatChip label="Waiting for your OK" value={waiting} />
                  </Link>
                )}
              </div>

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
                    <button
                      type="button"
                      onClick={() => setTab("chat")}
                      className="text-muted-foreground hover:text-foreground w-full py-1 text-center text-xs"
                    >
                      or describe something custom in chat
                    </button>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          <SkillLibraryDialog
            meta={meta}
            mine={mine}
            open={libraryOpen}
            onOpenChange={setLibraryOpen}
          />
        </>
      )}
    </div>
  );
}
