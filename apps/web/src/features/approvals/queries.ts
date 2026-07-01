import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export type Approval = Tables<"approvals">;

export const approvalKeys = {
  all: ["approvals"] as const,
  pendingCount: ["approvals", "pending-count"] as const,
};

/** All recent approvals the user can see (RLS scopes to their team); newest first. */
export const approvalsQueryOptions = queryOptions({
  queryKey: approvalKeys.all,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("approvals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  },
});

/** Count of pending approvals, for the sidebar badge. */
export const pendingApprovalCountQueryOptions = queryOptions({
  queryKey: approvalKeys.pendingCount,
  queryFn: async () => {
    const { count, error } = await supabase
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) throw error;
    return count ?? 0;
  },
});
