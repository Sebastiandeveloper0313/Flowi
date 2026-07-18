import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const employeeKeys = {
  all: ["employees"] as const,
};

/**
 * The employee's actual work products: leads with drafted replies, and post
 * drafts, across all their agents. This is what the Work tab renders as a
 * portfolio; limits are generous enough for the feed plus 7-day counts.
 */
export const employeeDeliverablesQueryOptions = (teamId: string | null, taskIds: string[]) =>
  queryOptions({
    queryKey: [...employeeKeys.all, "deliverables", teamId, [...taskIds].sort().join(",")] as const,
    queryFn: async () => {
      const [leads, drafts] = await Promise.all([
        supabase
          .from("leads")
          .select("*")
          .eq("team_id", teamId!)
          .in("task_id", taskIds)
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("post_drafts")
          .select("*")
          .eq("team_id", teamId!)
          .in("task_id", taskIds)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      if (leads.error) throw leads.error;
      if (drafts.error) throw drafts.error;
      return { leads: leads.data ?? [], drafts: drafts.data ?? [] };
    },
    enabled: !!teamId && taskIds.length > 0,
    refetchInterval: 30_000,
  });

/**
 * One employee's last-24h numbers: leads its agents found, and replies that
 * went out. Keyed by the employee's task ids so each role only counts its own
 * work (the ids come from the client-side kind→role mapping).
 */
export const employeeStatsQueryOptions = (teamId: string | null, taskIds: string[]) =>
  queryOptions({
    queryKey: [...employeeKeys.all, "stats", teamId, [...taskIds].sort().join(",")] as const,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [leads, posted] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId!)
          .in("task_id", taskIds)
          .gte("created_at", since),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId!)
          .in("task_id", taskIds)
          .eq("status", "posted")
          .gte("updated_at", since),
      ]);
      if (leads.error) throw leads.error;
      if (posted.error) throw posted.error;
      return { leadsFound: leads.count ?? 0, postedReplies: posted.count ?? 0 };
    },
    enabled: !!teamId && taskIds.length > 0,
    refetchInterval: 60_000,
  });
