import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export type WorkspaceRow = Pick<
  Tables<"teams">,
  "id" | "name" | "website_url" | "business_context" | "business_description"
>;

export const workspaceKeys = {
  current: ["workspace"] as const,
};

/** The user's workspace (team) with its business context. RLS scopes to their team. */
export const workspaceQueryOptions = queryOptions({
  queryKey: workspaceKeys.current,
  queryFn: async (): Promise<WorkspaceRow | null> => {
    const { data, error } = await supabase
      .from("teams")
      .select("id, name, website_url, business_context, business_description")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
});
