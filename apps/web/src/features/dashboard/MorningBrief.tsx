import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";

import { useUser } from "@/auth/hooks";
import { usePendingApprovalCount } from "@/features/approvals/hooks";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { useRuns, useTasks } from "@/features/tasks/hooks";
import { useActiveTeamId } from "@/features/workspace/active";
import { supabase } from "@/integrations/supabase/client";

/**
 * The chat landing's greeting. For a workspace with agents it opens with proof
 * of work: "While you were away: 14 leads found · 2 tasks finished · 6 waiting
 * for your OK", so every visit starts with what Sentrive did, not a blank
 * prompt. Brand-new workspaces keep the original call to action.
 */
export function MorningBrief() {
  const { data: user } = useUser();
  const { data: tasks } = useTasks();
  const { data: runs } = useRuns();
  const teamId = useActiveTeamId();
  const { data: pendingApprovals } = usePendingApprovalCount();
  const { data: replyGroups } = usePendingLeadReplies();

  const { data: leads24h } = useQuery({
    queryKey: ["brief-leads", teamId],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId!)
        .gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!teamId,
    refetchInterval: 60_000,
  });

  const hasAgents = (tasks ?? []).length > 0;
  if (!hasAgents) {
    // First run: one question, plus the honest alternative right under it, so
    // nobody stares at an empty box wondering if typing is the only way in.
    return (
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          What should Sentrive take care of?
        </h2>
        <p className="text-muted-foreground mt-2 text-[15px]">
          Describe any recurring job and it gets built, or hire a ready-made employee below.
        </p>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? "Welcome back"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  const rawName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim();
  const name = rawName ? rawName.split(/\s+/)[0] : null;

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const finished = (runs ?? []).filter(
    (r) => r.status === "succeeded" && new Date(r.created_at).getTime() >= since,
  ).length;
  const waiting = (pendingApprovals ?? 0) + (replyGroups ?? []).reduce((s, g) => s + g.count, 0);

  const bits: React.ReactNode[] = [];
  if ((leads24h ?? 0) > 0)
    bits.push(
      <span key="leads">
        <b className="text-foreground">{leads24h}</b> lead{leads24h === 1 ? "" : "s"} found
      </span>,
    );
  if (finished > 0)
    bits.push(
      <span key="runs">
        <b className="text-foreground">{finished}</b> task{finished === 1 ? "" : "s"} finished
      </span>,
    );
  if (waiting > 0)
    bits.push(
      <Link key="waiting" to="/approvals" className="text-primary font-semibold hover:underline">
        {waiting} waiting for your OK
      </Link>,
    );

  return (
    <div className="mb-8 text-center">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {greeting}
        {name ? `, ${name}` : ""}.
      </h2>
      <p className="text-muted-foreground mt-2.5 text-[15px]">
        {bits.length > 0 ? (
          <>
            While you were away:{" "}
            {bits.map((b, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="mx-1.5 opacity-60">·</span>}
                {b}
              </Fragment>
            ))}
          </>
        ) : (
          "All quiet in the last 24 hours. Your agents run on schedule."
        )}
      </p>
    </div>
  );
}
