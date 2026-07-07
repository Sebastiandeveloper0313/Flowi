import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveTeamId } from "@/features/workspace/active";
import { supabase } from "@/integrations/supabase/client";

import { type AutonomyMode, autonomyKeys, autonomyQueryOptions } from "./queries";

export function useAutonomy() {
  return useQuery(autonomyQueryOptions(useActiveTeamId()));
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
    onMutate: async ({ teamId, mode }) => {
      const key = [...autonomyKeys.mode, teamId] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData(key);
      queryClient.setQueryData(
        key,
        (old: { teamId: string; mode: AutonomyMode } | null | undefined) =>
          old ? { ...old, mode } : old,
      );
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined && ctx?.key) queryClient.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: autonomyKeys.mode }),
  });
}
