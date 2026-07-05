import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export type WorkspaceRow = Tables<"teams">;

export const workspaceKeys = {
  current: ["workspace"] as const,
};

/**
 * The user's workspace (team) with its business context. RLS scopes to their
 * team. Shares the ["workspace"] cache with the route guard's query in
 * features/onboarding/queries.ts, so both MUST select every column: a
 * narrower select here would overwrite the cached row without
 * onboarding_completed/plan and the guard would bounce users to /onboarding.
 */
export const workspaceQueryOptions = queryOptions({
  queryKey: workspaceKeys.current,
  queryFn: async (): Promise<WorkspaceRow | null> => {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  staleTime: 5 * 60 * 1000,
});
