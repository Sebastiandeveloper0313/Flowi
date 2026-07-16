import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const deskKeys = {
  all: ["desk"] as const,
};

/**
 * The employee's "today" numbers for the desk header: leads found in the last
 * 24h and posts published in the last 24h (leads that reached status 'posted').
 * Cheap head-count queries; everything else on the desk reuses existing caches.
 */
export const deskStatsQueryOptions = (teamId: string | null) =>
  queryOptions({
    queryKey: [...deskKeys.all, "stats", teamId] as const,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [leads, posted] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId!)
          .gte("created_at", since),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId!)
          .eq("status", "posted")
          .gte("updated_at", since),
      ]);
      if (leads.error) throw leads.error;
      if (posted.error) throw posted.error;
      return { leadsFound: leads.count ?? 0, postedReplies: posted.count ?? 0 };
    },
    enabled: !!teamId,
    refetchInterval: 60_000,
  });
