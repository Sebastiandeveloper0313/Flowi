import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export type Approval = Tables<"approvals">;

export const approvalKeys = {
  all: ["approvals"] as const,
  pendingCount: ["approvals", "pending-count"] as const,
};

/** The active workspace's recent approvals, newest first. */
export const approvalsQueryOptions = (teamId: string | null) =>
  queryOptions({
    queryKey: [...approvalKeys.all, teamId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approvals")
        .select("*")
        .eq("team_id", teamId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });

/** Count of pending approvals in the active workspace, for the sidebar badge. */
export const pendingApprovalCountQueryOptions = (teamId: string | null) =>
  queryOptions({
    queryKey: [...approvalKeys.pendingCount, teamId] as const,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("approvals")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId!)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!teamId,
  });
