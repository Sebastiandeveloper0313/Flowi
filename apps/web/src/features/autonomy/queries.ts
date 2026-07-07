import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AutonomyMode = "ask" | "auto";

export const autonomyKeys = {
  mode: ["autonomy"] as const,
};

/** The active workspace's autonomy mode. */
export const autonomyQueryOptions = (teamId: string | null) =>
  queryOptions({
    queryKey: [...autonomyKeys.mode, teamId] as const,
    queryFn: async (): Promise<{ teamId: string; mode: AutonomyMode } | null> => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, autonomy_mode")
        .eq("id", teamId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { teamId: data.id, mode: data.autonomy_mode === "auto" ? "auto" : "ask" };
    },
    enabled: !!teamId,
    staleTime: 30_000,
  });
