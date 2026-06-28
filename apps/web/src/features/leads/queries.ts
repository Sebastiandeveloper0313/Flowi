import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export type Lead = Tables<"leads">;
export type LeadStatus = "new" | "approved" | "dismissed" | "posted";

export const leadKeys = {
  all: ["leads"] as const,
};

/** All leads the user can see (RLS scopes to their team); strongest first. */
export const leadsQueryOptions = queryOptions({
  queryKey: leadKeys.all,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("relevance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data;
  },
});
