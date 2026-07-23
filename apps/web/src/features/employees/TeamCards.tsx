import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight, Plus } from "lucide-react";

import { useApprovals } from "@/features/approvals/hooks";
import { useMissingToolkits } from "@/features/integrations/hooks";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { formatWhen, useRuns, useTasks } from "@/features/tasks/hooks";
import type { Task } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";

import { customAgentMeta, useCustomAgents } from "./customAgents";
import { EmployeeAvatar } from "./EmployeeAvatar";
import { EMPLOYEES, tasksOfRole, type EmployeeMeta } from "./roles";

/**
 * The roster, in two layers: YOUR agents first (anything with skills, plus
 * every agent you created), then the ready-made catalog underneath as an
 * offer. A working agent reads like a person at work (status, last worked,
 * what's waiting); catalog cards are pre-briefed hires one click away.
 */
export function TeamCards() {
  const { data: tasks } = useTasks();
  const { data: customs } = useCustomAgents();

  const customIds = new Set((customs ?? []).map((c) => c.id));
  const roster = [...EMPLOYEES, ...(customs ?? []).map(customAgentMeta)];
  const cards = roster.map((meta) => ({
    meta,
    mine: tasksOfRole(tasks ?? [], meta.role, customIds),
  }));

  // YOUR agents: anything actually working for you (plus your own creations).
  // The unhired ready-mades are a catalog below, offered, never imposed: a
  // team that only wants its own agents never has ours in their roster.
  const active = cards.filter((c) => c.mine.length > 0 || c.meta.custom);
  const catalog = cards.filter((c) => !(c.mine.length > 0 || c.meta.custom));

  return (
    <div className="space-y-10">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map(({ meta, mine }) => (
          <EmployeeCard key={meta.role} meta={meta} mine={mine} />
        ))}
        <NewAgentCard />
      </div>

      {catalog.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Ready-made agents</h3>
          <p className="text-muted-foreground mb-4 text-sm">
            Pre-briefed on your business. Add one and it works today, or ignore them and build your
            own.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map(({ meta, mine }) => (
              <EmployeeCard key={meta.role} meta={meta} mine={mine} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * New agents are born in chat, like everything else: describe the job and
 * Sentrive proposes either a skill for an existing agent or a brand-new one.
 * This card jumps you into the composer, focused and ready to type, whether
 * you're already on the dashboard or coming from the Agents page.
 */
function NewAgentCard() {
  const navigate = useNavigate();

  function openComposer() {
    void navigate({ to: "/dashboard", search: { c: undefined } });
    let tries = 0;
    const focus = () => {
      const el = document.getElementById("chat-composer") as HTMLTextAreaElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      } else if (tries++ < 20) {
        setTimeout(focus, 50);
      }
    };
    focus();
  }

  return (
    <button
      type="button"
      onClick={openComposer}
      className="text-muted-foreground hover:border-primary/40 hover:text-foreground flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-sm font-medium transition"
    >
      <Plus className="size-5" />
      New agent
      <span className="text-muted-foreground text-xs font-normal">
        Describe the job in chat and Sentrive sets it up
      </span>
    </button>
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
        {!meta.comingSoon && !hired && !meta.custom && (
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
