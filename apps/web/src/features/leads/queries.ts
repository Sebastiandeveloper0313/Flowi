import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export type Lead = Tables<"leads">;
export type LeadStatus = "new" | "approved" | "queued" | "dismissed" | "posted";

export const leadKeys = {
  all: ["leads"] as const,
};

export interface PendingLeadReplyGroup {
  taskId: string;
  count: number;
}

/**
 * Reddit reply drafts still waiting for the user to review and post, grouped by
 * agent. These are approval-shaped (an outbound action gated on a manual click),
 * so the Approvals page surfaces them even though the review happens in Leads.
 * Keyed under leadKeys so posting/dismissing a lead refreshes it too.
 */
export const pendingLeadRepliesQueryOptions = (teamId: string | null) =>
  queryOptions({
    queryKey: [...leadKeys.all, "pending-replies", teamId] as const,
    queryFn: async (): Promise<PendingLeadReplyGroup[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("task_id")
        .eq("team_id", teamId!)
        .eq("source", "reddit")
        .eq("status", "new")
        .not("draft_reply", "is", null)
        .neq("draft_reply", "");
      if (error) throw error;
      const byTask = new Map<string, number>();
      for (const l of data ?? []) {
        if (!l.task_id) continue;
        byTask.set(l.task_id, (byTask.get(l.task_id) ?? 0) + 1);
      }
      return [...byTask.entries()].map(([taskId, count]) => ({ taskId, count }));
    },
    enabled: !!teamId,
  });

/** Leads found by one agent (RLS-scoped); strongest first. */
export const leadsByTaskQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: [...leadKeys.all, taskId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("task_id", taskId)
        .order("relevance", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
