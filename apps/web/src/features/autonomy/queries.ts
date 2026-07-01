import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AutonomyMode = "ask" | "auto";

export const autonomyKeys = {
  mode: ["autonomy"] as const,
};

/** The workspace's autonomy mode (RLS scopes to the user's team). */
export const autonomyQueryOptions = queryOptions({
  queryKey: autonomyKeys.mode,
  queryFn: async (): Promise<{ teamId: string; mode: AutonomyMode } | null> => {
    const { data, error } = await supabase
      .from("teams")
      .select("id, autonomy_mode")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { teamId: data.id, mode: data.autonomy_mode === "auto" ? "auto" : "ask" };
  },
  staleTime: 30_000,
});
