import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight, Briefcase, CheckCheck, Headset, Loader2 } from "lucide-react";

import { useApprovals } from "@/features/approvals/hooks";
import { PageHeader } from "@/features/dashboard/ui";
import { employeeStatsQueryOptions } from "@/features/employees/queries";
import { EMPLOYEES, tasksOfRole, type EmployeeMeta } from "@/features/employees/roles";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { useTasks } from "@/features/tasks/hooks";
import type { Task } from "@/features/tasks/queries";
import { useActiveTeamId } from "@/features/workspace/active";
import { useWorkspace } from "@/features/workspace/hooks";

export const Route = createFileRoute("/_authenticated/home")({
  component: TeamPage,
});

const ROLE_ICON = { marketing: Briefcase, support: Headset } as const;

/**
 * Your team. One card per employee: hired ones show what they're doing and
 * what's waiting on you; unhired ones are one clear pitch and a Hire button.
 * That's the whole page: the product IS the employees, everything else lives
 * inside them.
 */
function TeamPage() {
  const { data: ws } = useWorkspace();
  const { data: tasks, isLoading } = useTasks();
  const company = ws?.name && ws.name !== "My team" ? ws.name : "your business";

  return (
    <div className="flowy-page">
      <PageHeader
        title="Your team"
        subtitle={`The AI employees working for ${company}. Open one to see its work, or hire for a role.`}
      />

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading your team…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {EMPLOYEES.map((meta) => (
            <EmployeeCard key={meta.role} meta={meta} tasks={tasksOfRole(tasks ?? [], meta.role)} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeCard({ meta, tasks }: { meta: EmployeeMeta; tasks: Task[] }) {
  const teamId = useActiveTeamId();
  const { data: approvals } = useApprovals();
  const { data: leadGroups } = usePendingLeadReplies();
  const hired = tasks.length > 0;
  const active = tasks.filter((t) => t.status === "active");
  const ids = new Set(tasks.map((t) => t.id));
  const { data: stats } = useQuery(employeeStatsQueryOptions(teamId, [...ids]));

  const waiting =
    (approvals ?? []).filter((a) => a.status === "pending" && a.task_id && ids.has(a.task_id))
      .length +
    (leadGroups ?? []).filter((g) => ids.has(g.taskId)).reduce((s, g) => s + g.count, 0);

  const Icon = ROLE_ICON[meta.role];

  return (
    <Link
      to="/employees/$role"
      params={{ role: meta.role }}
      className="bg-card hover:border-primary/40 group flex flex-col rounded-2xl border p-6 shadow-xs transition"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eef4fd] text-[#1566e6]">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{meta.title}</h2>
            {hired ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                On the job
              </span>
            ) : (
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                Not hired yet
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {hired ? meta.blurb : meta.hirePitch}
          </p>
        </div>
      </div>

      {hired ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <span>
            <b>{active.length}</b>{" "}
            <span className="text-muted-foreground">
              dut{active.length === 1 ? "y" : "ies"} running
            </span>
          </span>
          {meta.role === "marketing" && (
            <span>
              <b>{stats?.leadsFound ?? "…"}</b>{" "}
              <span className="text-muted-foreground">leads · 24h</span>
            </span>
          )}
          {waiting > 0 && (
            <span className="text-primary flex items-center gap-1 font-medium">
              <CheckCheck className="size-3.5" /> {waiting} waiting on you
            </span>
          )}
        </div>
      ) : null}

      <div className="mt-auto pt-5">
        <Button
          variant={hired ? "outline" : "default"}
          size="sm"
          className="pointer-events-none w-full"
          tabIndex={-1}
        >
          {hired ? "Open" : `Hire ${meta.title}`} <ArrowRight className="size-4" />
        </Button>
      </div>
    </Link>
  );
}
