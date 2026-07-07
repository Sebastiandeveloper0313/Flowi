import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export type Lead = Tables<"leads">;
export type LeadStatus = "new" | "approved" | "queued" | "dismissed" | "posted";

export const leadKeys = {
  all: ["leads"] as const,
};

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
