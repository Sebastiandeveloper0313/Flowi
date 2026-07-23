import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Activity, ArrowLeft, Loader2, MessageSquare, Settings2 } from "lucide-react";
import { useState } from "react";

import { useApprovals } from "@/features/approvals/hooks";
import { EmployeeAvatar } from "@/features/employees/EmployeeAvatar";
import { EmployeeChat } from "@/features/employees/EmployeeChat";
import { EmployeeSettings } from "@/features/employees/EmployeeSettings";
import { RoleHire } from "@/features/employees/RoleHire";
import {
  employeeMeta,
  HIREABLE_ROLES,
  tasksOfRole,
  type EmployeeRole,
} from "@/features/employees/roles";
import { WorkTab } from "@/features/employees/WorkTab";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { useTasks } from "@/features/tasks/hooks";

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
 * One employee's workspace behind a single minimal bar: back link, a floating
 * pill with the employee and their Work / Chat / Settings tabs, a pending
 * count. Work is the live view (presence, shift plan, finished work), Chat is
 * their direct line, Settings is connections/schedules/firing. An unhired
 * employee's page IS the hiring interview.
 */
function EmployeePage() {
  const { role } = Route.useParams();
  const meta = employeeMeta(role);
  const [tab, setTab] = useState<Tab>("work");

  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: approvals } = useApprovals();
  const { data: leadGroups } = usePendingLeadReplies();

  const mine = tasksOfRole(tasks ?? [], role);
  const mineIds = new Set(mine.map((t) => t.id));

  const waiting =
    (approvals ?? []).filter((a) => a.status === "pending" && a.task_id && mineIds.has(a.task_id))
      .length +
    (leadGroups ?? []).filter((g) => mineIds.has(g.taskId)).reduce((s, g) => s + g.count, 0);

  const hired = !tasksLoading && mine.length > 0;

  return (
    <div className="flowy-page">
      {/* One minimal bar: back on the left, the employee and their tabs as a
          single floating pill in the center, pending count on the right. */}
      <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Link
          to="/team"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 justify-self-start text-sm"
        >
          <ArrowLeft className="size-4" /> Your agents
        </Link>

        <div className="bg-card flex items-center gap-1 rounded-full border p-1 shadow-xs">
          <EmployeeAvatar meta={meta} className="size-7 rounded-full text-sm" />
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
      ) : tab === "chat" ? (
        <EmployeeChat meta={meta} />
      ) : tab === "settings" ? (
        <EmployeeSettings meta={meta} mine={mine} />
      ) : (
        <WorkTab meta={meta} mine={mine} onOpenChat={() => setTab("chat")} />
      )}
    </div>
  );
}
