import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveTeamId } from "@/features/workspace/active";
import { supabase } from "@/integrations/supabase/client";

export interface ToolkitStatus {
  slug: string;
  connected: boolean;
  status: string;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("integrations", { body });
  if (error) throw error;
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export const integrationKeys = {
  all: ["integrations"] as const,
  team: (teamId: string | null) => ["integrations", teamId] as const,
};

/** The active workspace's connection status per toolkit. Set `poll` during a connect. */
export function useIntegrations(poll = false) {
  const teamId = useActiveTeamId();
  return useQuery({
    queryKey: integrationKeys.team(teamId),
    queryFn: () =>
      invoke<{ toolkits: ToolkitStatus[] }>({ action: "list", team_id: teamId }).then(
        (d) => d.toolkits,
      ),
    enabled: !!teamId,
    refetchInterval: poll ? 3000 : false,
  });
}

/** Which of `slugs` are not connected yet. Set `poll` while a connect is in flight. */
export function useMissingToolkits(slugs: string[], poll = false) {
  const { data, isLoading } = useIntegrations(poll);
  return {
    isLoading,
    loaded: data !== undefined,
    missing:
      data === undefined
        ? []
        : slugs.filter((slug) => !data.find((t) => t.slug === slug)?.connected),
  };
}

/** Start connecting a toolkit for the active workspace; returns the hosted-auth URL. */
export function useConnectIntegration() {
  const queryClient = useQueryClient();
  const teamId = useActiveTeamId();
  return useMutation({
    mutationFn: (toolkit: string) =>
      invoke<{ redirect_url: string }>({ action: "connect", toolkit, team_id: teamId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}
