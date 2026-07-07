import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  analyzeWebsite,
  type BusinessContext,
  updateWorkspace,
} from "@/features/onboarding/mutations";

import { useActiveWorkspace } from "./active";
import { workspaceKeys } from "./queries";

/** The active workspace (product), in the { data, isLoading } shape callers expect. */
export function useWorkspace() {
  const { active, isLoading } = useActiveWorkspace();
  return { data: active, isLoading } as const;
}

/** Analyze a website URL into structured business context for the active workspace. */
export function useAnalyzeWebsite() {
  const queryClient = useQueryClient();
  const { activeTeamId } = useActiveWorkspace();
  return useMutation({
    mutationFn: (websiteUrl: string) =>
      analyzeWebsite({ website_url: websiteUrl, team_id: activeTeamId ?? undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.current }),
  });
}

/** Save the user's up-front instructions for how their replies should sound. */
export function useUpdateReplyInstructions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, instructions }: { teamId: string; instructions: string }) =>
      updateWorkspace(teamId, { reply_instructions: instructions }),
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
