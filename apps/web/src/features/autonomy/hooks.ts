import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import { type AutonomyMode, autonomyKeys, autonomyQueryOptions } from "./queries";

export function useAutonomy() {
  return useQuery(autonomyQueryOptions);
}

/** Switch the workspace autonomy mode, with an optimistic update for instant feedback. */
export function useSetAutonomyMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, mode }: { teamId: string; mode: AutonomyMode }) => {
      const { error } = await supabase
        .from("teams")
        .update({ autonomy_mode: mode })
        .eq("id", teamId);
      if (error) throw error;
      return mode;
    },
    onMutate: async ({ mode }) => {
      await queryClient.cancelQueries({ queryKey: autonomyKeys.mode });
      const prev = queryClient.getQueryData(autonomyKeys.mode);
      queryClient.setQueryData(
        autonomyKeys.mode,
        (old: { teamId: string; mode: AutonomyMode } | null | undefined) =>
          old ? { ...old, mode } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(autonomyKeys.mode, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: autonomyKeys.mode }),
  });
}
