import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { publishPostDraft, setPostDraftStatus, updatePostDraft } from "./mutations";
import { postDraftsByTaskQueryOptions, postKeys } from "./queries";

export function useAgentPostDrafts(taskId: string) {
  return useQuery(postDraftsByTaskQueryOptions(taskId));
}

export function useUpdatePostDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { title?: string; body?: string; subreddits?: string[] };
    }) => updatePostDraft(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: postKeys.all }),
  });
}

export function useSetPostDraftStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "draft" | "dismissed" }) =>
      setPostDraftStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: postKeys.all }),
  });
}

/** Publish a draft to the selected subreddits (the click is the approval). */
export function usePublishPostDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishPostDraft,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: postKeys.all }),
  });
}
