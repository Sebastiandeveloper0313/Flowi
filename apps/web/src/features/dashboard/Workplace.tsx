import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { CheckCheck, ChevronRight } from "lucide-react";
import { useState } from "react";

import { useApprovals } from "@/features/approvals/hooks";
import { useCustomAgents } from "@/features/employees/customAgents";
import { buildWorkItems, LeadReplyCard, WorkItemRow } from "@/features/employees/Deliverables";
import { EmployeeAvatar } from "@/features/employees/EmployeeAvatar";
import { employeeMeta, roleOfTask, type EmployeeRole } from "@/features/employees/roles";
import { InboxApprovalRow } from "@/features/employees/ui";
import { useRuns, useTasks } from "@/features/tasks/hooks";
import { useActiveTeamId } from "@/features/workspace/active";
import { supabase } from "@/integrations/supabase/client";

/**
 * One workplace: everything every agent did and everything that needs the
 * user, on the page they already open. No walking between agent pages and
 * employee desks; those stay for tuning and for a single area's view.
 */
export function Workplace() {
  const teamId = useActiveTeamId();
  const { data: tasks } = useTasks();
  const { data: runs } = useRuns();
  const { data: approvals } = useApprovals();
  const { data: customs } = useCustomAgents();
  const [showAllWaiting, setShowAllWaiting] = useState(false);

  // Every deliverable in the workspace, not one agent's slice.
  const { data: work } = useQuery({
    queryKey: ["workplace", teamId],
    queryFn: async () => {
      const [leads, drafts] = await Promise.all([
        supabase
          .from("leads")
          .select("*")
          .eq("team_id", teamId!)
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("post_drafts")
          .select("*")
          .eq("team_id", teamId!)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      if (leads.error) throw leads.error;
      if (drafts.error) throw drafts.error;
      return { leads: leads.data ?? [], drafts: drafts.data ?? [] };
    },
    enabled: !!teamId,
    refetchInterval: 30_000,
  });

  const allTasks = tasks ?? [];
  if (allTasks.length === 0) return null;

  const customIds = new Set((customs ?? []).map((c) => c.id));
  const pendingLeads = (work?.leads ?? []).filter(
    (l) => l.status === "new" && (l.draft_reply ?? "").trim() !== "",
  );
  const pendingApprovals = (approvals ?? []).filter((a) => a.status === "pending");
  const waiting = pendingLeads.length + pendingApprovals.length;

  const items = buildWorkItems({
    leads: (work?.leads ?? []).filter((l) => l.status !== "new"),
    drafts: work?.drafts ?? [],
    runs: runs ?? [],
    tasks: allTasks,
  });

  // Who reported in since yesterday, so the day starts with people, not rows.
  const day = Date.now() - 24 * 60 * 60 * 1000;
  const byOwner = new Map<string, number>();
  for (const t of allTasks) {
    const owner = roleOfTask(t, customIds);
    if (!owner) continue;
    const did = (runs ?? []).filter(
      (r) =>
        r.task_id === t.id && r.status === "succeeded" && new Date(r.created_at).getTime() >= day,
    ).length;
    if (did > 0) byOwner.set(owner, (byOwner.get(owner) ?? 0) + did);
  }
  const reporters = [...byOwner.entries()]
    .map(([role, count]) => {
      const row = (customs ?? []).find((c) => c.id === role);
      const meta = row
        ? {
            role,
            name: row.name,
            emoji: row.emoji || "",
            avatar: row.avatar_url ?? undefined,
            tint: "bg-slate-100 text-slate-600",
            title: row.title,
            blurb: "",
            hirePitch: "",
            relevantToolkits: [],
            trainedLine: "",
            starterTemplates: [],
            custom: true,
          }
        : employeeMeta(role as EmployeeRole);
      return { meta, count };
    })
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      {/* Who did what since yesterday */}
      {reporters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {reporters.map(({ meta, count }) => (
            <Link
              key={meta.role}
              to="/team/$role"
              params={{ role: meta.role }}
              className="bg-card hover:border-primary/40 flex items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-1.5 text-sm shadow-xs transition"
            >
              <EmployeeAvatar meta={meta} className="size-7 rounded-full text-sm" />
              <span className="font-medium">{meta.name}</span>
              <span className="text-muted-foreground">
                {count} run{count === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Everything that needs you, actionable right here */}
      {waiting > 0 && (
        <section className="bg-card rounded-2xl border p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <CheckCheck className="size-4" /> Waiting for you
              <span className="text-muted-foreground font-normal">({waiting})</span>
            </h3>
            <Link to="/approvals" className="text-primary text-sm font-medium hover:underline">
              Open all
            </Link>
          </div>
          <div className="space-y-2">
            {pendingLeads.slice(0, showAllWaiting ? undefined : 3).map((l) => (
              <LeadReplyCard key={l.id} lead={l} />
            ))}
            {pendingApprovals.slice(0, showAllWaiting ? undefined : 3).map((a) => (
              <InboxApprovalRow key={a.id} approval={a} />
            ))}
            {(pendingLeads.length > 3 || pendingApprovals.length > 3) && (
              <button
                type="button"
                onClick={() => setShowAllWaiting((v) => !v)}
                className="text-muted-foreground hover:text-foreground block w-full py-1 text-center text-sm font-medium"
              >
                {showAllWaiting ? "Show fewer" : `Show all ${waiting}`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* What got done, across every agent */}
      <section className="bg-card rounded-2xl border p-5 shadow-xs">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Work done</h3>
          <Link to="/agents" className="text-primary text-sm font-medium hover:underline">
            All agents
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Nothing yet. The moment an agent runs, its work shows up here.
          </p>
        ) : (
          <div className="-mx-2">
            {items.slice(0, 10).map((item) => (
              <WorkItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <div className="flex justify-center">
        <Button variant="ghost" className="text-muted-foreground" asChild>
          <Link to="/team">
            Your team <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
