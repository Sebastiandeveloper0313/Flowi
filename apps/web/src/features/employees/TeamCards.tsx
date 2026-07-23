import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight } from "lucide-react";

import { useApprovals } from "@/features/approvals/hooks";
import { useMissingToolkits } from "@/features/integrations/hooks";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { formatWhen, useRuns, useTasks } from "@/features/tasks/hooks";
import type { Task } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";

import { EmployeeAvatar } from "./EmployeeAvatar";
import { EMPLOYEES, tasksOfRole, type EmployeeMeta } from "./roles";

/**
 * The roster: every employee, always. Hired ones read like a person at work
 * (status, last worked, what's waiting); candidates are pre-briefed hires one
 * click away; coming-soon roles show where the team is headed. Ordered so the
 * working team leads and the future trails.
 */
export function TeamCards() {
  const { data: tasks } = useTasks();

  const cards = EMPLOYEES.map((meta) => ({
    meta,
    mine: tasksOfRole(tasks ?? [], meta.role),
  })).sort((a, b) => {
    const rank = (c: { meta: EmployeeMeta; mine: Task[] }) =>
      c.meta.comingSoon ? 2 : c.mine.length > 0 ? 0 : 1;
    return rank(a) - rank(b);
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(({ meta, mine }) => (
        <EmployeeCard key={meta.role} meta={meta} mine={mine} />
      ))}
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "green" | "amber" | "gray" | "blue" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : tone === "blue"
          ? "bg-[#eef4fd] text-[#1566e6]"
          : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function EmployeeCard({ meta, mine }: { meta: EmployeeMeta; mine: Task[] }) {
  const { data: runs } = useRuns();
  const { data: approvals } = useApprovals();
  const { data: leadGroups } = usePendingLeadReplies();

  const hired = mine.length > 0;
  const ids = new Set(mine.map((t) => t.id));
  const active = mine.filter((t) => t.status === "active");
  const needed = [...new Set(active.flatMap((t) => requiredToolkits(t)))];
  const { missing, loaded } = useMissingToolkits(needed);

  const lastRun = (runs ?? []).find((r) => ids.has(r.task_id));
  const waiting =
    (approvals ?? []).filter((a) => a.status === "pending" && a.task_id && ids.has(a.task_id))
      .length +
    (leadGroups ?? []).filter((g) => ids.has(g.taskId)).reduce((s, g) => s + g.count, 0);

  const status = meta.comingSoon
    ? ({ label: "Coming soon", tone: "gray" } as const)
    : !hired
      ? ({ label: "Available", tone: "blue" } as const)
      : loaded && missing.length > 0
        ? ({ label: "Setup needed", tone: "amber" } as const)
        : active.length > 0
          ? ({ label: "Working", tone: "green" } as const)
          : ({ label: "Paused", tone: "gray" } as const);

  // One quiet line under the header; anything actionable gets its own accent
  // line, everything else stays out of the card.
  const metaLine = meta.comingSoon
    ? meta.blurb
    : !hired
      ? meta.blurb
      : lastRun
        ? `${mine.length} skill${mine.length === 1 ? "" : "s"} · worked ${formatWhen(lastRun.created_at)}`
        : `${mine.length} skill${mine.length === 1 ? "" : "s"} · no runs yet`;

  const body = (
    <>
      <div className="flex items-center gap-4">
        <EmployeeAvatar meta={meta} className="size-14 rounded-2xl text-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold">{meta.name}</span>
            <StatusChip label={status.label} tone={status.tone} />
          </div>
          <p className="text-muted-foreground truncate text-sm">{meta.title}</p>
        </div>
        {!meta.comingSoon && hired && (
          <ArrowRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
        )}
      </div>

      <div className="flex min-h-8 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground truncate text-sm">{metaLine}</p>
          {hired && waiting > 0 && (
            <p className="text-primary mt-0.5 text-sm font-medium">{waiting} waiting for your OK</p>
          )}
        </div>
        {!meta.comingSoon && !hired && (
          <Button size="sm" className="pointer-events-none shrink-0" tabIndex={-1}>
            Add {meta.name}
          </Button>
        )}
      </div>
    </>
  );

  if (meta.comingSoon) {
    return (
      <div className="bg-card/60 flex flex-col gap-4 rounded-2xl border border-dashed p-6 opacity-80">
        {body}
      </div>
    );
  }

  return (
    <Link
      to="/team/$role"
      params={{ role: meta.role }}
      className="bg-card hover:border-primary/40 group flex flex-col gap-4 rounded-2xl border p-6 shadow-xs transition"
    >
      {body}
    </Link>
  );
}
