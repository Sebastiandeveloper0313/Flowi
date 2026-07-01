import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface ToolkitStatus {
  slug: string;
  connected: boolean;
  status: string;
}

async function invoke<T>(body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke("integrations", { body });
  if (error) throw error;
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export const integrationKeys = { all: ["integrations"] as const };

/** The team's connection status per supported toolkit. Set `poll` while a connect is in flight. */
export function useIntegrations(poll = false) {
  return useQuery({
    queryKey: integrationKeys.all,
    queryFn: () =>
      invoke<{ toolkits: ToolkitStatus[] }>({ action: "list" }).then((d) => d.toolkits),
    refetchInterval: poll ? 3000 : false,
  });
}

/** Start connecting a toolkit; returns the hosted-auth URL to open. */
export function useConnectIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (toolkit: string) =>
      invoke<{ redirect_url: string }>({ action: "connect", toolkit }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}
