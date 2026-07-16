import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight, Bot, CalendarClock, CheckCheck, Sparkles } from "lucide-react";

import { useApprovals } from "@/features/approvals/hooks";
import { toolkitLogo } from "@/features/integrations/ConnectCta";
import { useMissingToolkits } from "@/features/integrations/hooks";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { formatWhen, useRuns, useTasks } from "@/features/tasks/hooks";
import type { Task } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";
import { useWorkspace } from "@/features/workspace/hooks";

import { EMPLOYEES, tasksOfRole, templatesOfRole, type EmployeeMeta } from "./roles";

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
    <div className="grid gap-4 sm:grid-cols-2">
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
  const { data: ws } = useWorkspace();

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

  const body = (
    <>
      <div className="flex items-center gap-3">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-xl text-xl ${meta.tint}`}
        >
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{meta.name}</span>
            <StatusChip label={status.label} tone={status.tone} />
          </div>
          <p className="text-muted-foreground truncate text-sm">
            {meta.title} · {meta.blurb}
          </p>
        </div>
        {!meta.comingSoon && (
          <ArrowRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
        )}
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
        <div className="grid gap-1.5">
          <p className="text-muted-foreground text-sm">{meta.hirePitch}</p>
          {(meta.comingSoon || ws?.business_context) && (
            <p
              className={`flex items-center gap-1.5 text-xs font-medium ${
                meta.comingSoon ? "text-muted-foreground" : "text-primary"
              }`}
            >
              <Sparkles className="size-3.5 shrink-0" /> {meta.trainedLine}
            </p>
          )}
        </div>
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
        {meta.comingSoon ? (
          <span className="text-muted-foreground text-xs">On the roadmap</span>
        ) : hired ? (
          <span className="text-muted-foreground text-xs">
            {templatesOfRole(meta.role).length} skills in library
          </span>
        ) : (
          <Button size="sm" className="pointer-events-none" tabIndex={-1}>
            Hire {meta.name}
          </Button>
        )}
      </div>
    </>
  );

  if (meta.comingSoon) {
    return (
      <div className="bg-card/60 flex flex-col gap-3 rounded-2xl border border-dashed p-5 opacity-80">
        {body}
      </div>
    );
  }

  return (
    <Link
      to="/team/$role"
      params={{ role: meta.role }}
      className="bg-card hover:border-primary/40 group flex flex-col gap-3 rounded-2xl border p-5 shadow-xs transition"
    >
      {body}
    </Link>
  );
}
