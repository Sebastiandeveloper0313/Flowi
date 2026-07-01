import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  analyzeWebsite,
  type BusinessContext,
  updateWorkspace,
} from "@/features/onboarding/mutations";

import { workspaceKeys, workspaceQueryOptions } from "./queries";

export function useWorkspace() {
  return useQuery(workspaceQueryOptions);
}

/** Analyze a website URL into structured business context and persist it. */
export function useAnalyzeWebsite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (websiteUrl: string) => analyzeWebsite({ website_url: websiteUrl }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.current }),
  });
}

/** Save manually-edited business context back to the workspace. */
export function useSaveBusinessContext() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      teamId,
      context,
      websiteUrl,
    }: {
      teamId: string;
      context: BusinessContext;
      websiteUrl?: string;
    }) =>
      updateWorkspace(teamId, {
        business_context: context,
        ...(websiteUrl !== undefined ? { website_url: websiteUrl } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.current }),
  });
}
