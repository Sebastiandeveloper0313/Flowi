import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight, Bot, CalendarClock, CheckCheck } from "lucide-react";

import { useApprovals } from "@/features/approvals/hooks";
import { toolkitLogo } from "@/features/integrations/ConnectCta";
import { useMissingToolkits } from "@/features/integrations/hooks";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { formatWhen, useRuns, useTasks } from "@/features/tasks/hooks";
import type { Task } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";

import { EMPLOYEES, tasksOfRole, templatesOfRole, type EmployeeMeta } from "./roles";

/**
 * The team as cards: one per employee. Hired ones read like a person at work
 * (status, last worked, what's waiting); unhired ones are the pitch and a Hire
 * button. `hideUnhired` keeps the dashboard clean for workspaces that haven't
 * hired anyone beyond the plan proposal shown above it.
 */
export function TeamCards({ hideUnhired = false }: { hideUnhired?: boolean }) {
  const { data: tasks } = useTasks();

  const cards = EMPLOYEES.map((meta) => ({
    meta,
    mine: tasksOfRole(tasks ?? [], meta.role),
  })).filter((c) => !hideUnhired || c.mine.length > 0);

  if (cards.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map(({ meta, mine }) => (
        <EmployeeCard key={meta.role} meta={meta} mine={mine} />
      ))}
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "green" | "amber" | "gray" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
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

  const status = !hired
    ? null
    : loaded && missing.length > 0
      ? ({ label: "Setup needed", tone: "amber" } as const)
      : active.length > 0
        ? ({ label: "Working", tone: "green" } as const)
        : ({ label: "Paused", tone: "gray" } as const);

  return (
    <Link
      to="/team/$role"
      params={{ role: meta.role }}
      className="bg-card hover:border-primary/40 group flex flex-col gap-3 rounded-2xl border p-5 shadow-xs transition"
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-xl text-xl ${meta.tint}`}
        >
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{meta.name}</span>
            {status && <StatusChip label={status.label} tone={status.tone} />}
          </div>
          <p className="text-muted-foreground truncate text-sm">
            {meta.title} · {hired ? meta.blurb : "not hired yet"}
          </p>
        </div>
        <ArrowRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
      </div>

      {hired ? (
        <div className="text-muted-foreground grid gap-1 text-xs">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" />
            {lastRun ? `Last worked ${formatWhen(lastRun.created_at)}` : "No runs yet"}
          </span>
          <span className="flex items-center gap-1.5">
            <Bot className="size-3.5" />
            {mine.length} skill{mine.length === 1 ? "" : "s"} running
          </span>
          {waiting > 0 && (
            <span className="text-primary flex items-center gap-1.5 font-medium">
              <CheckCheck className="size-3.5" /> {waiting} waiting for your OK
            </span>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{meta.hirePitch}</p>
      )}

      {/* The stack this employee works through, plus the size of their skill
          library: the at-a-glance "what am I actually hiring" line. */}
      <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
        <span className="flex -space-x-1.5">
          {meta.relevantToolkits.slice(0, 5).map((slug) => (
            <img
              key={slug}
              src={toolkitLogo(slug)}
              alt={slug}
              className="ring-border size-6 rounded-md bg-white object-contain p-0.5 ring-1"
            />
          ))}
        </span>
        {hired ? (
          <span className="text-muted-foreground text-xs">
            {templatesOfRole(meta.role).length} skills in library
          </span>
        ) : (
          <Button size="sm" className="pointer-events-none" tabIndex={-1}>
            Hire {meta.name}
          </Button>
        )}
      </div>
    </Link>
  );
}
