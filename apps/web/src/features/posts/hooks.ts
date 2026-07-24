import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveTeamId } from "@/features/workspace/active";

import {
  cancelQueuedDraft,
  publishPostDraft,
  rescheduleDraft,
  reschedulePost,
  schedulePostDraft,
  setPostDraftStatus,
  updatePostDraft,
} from "./mutations";
import {
  pendingPostDraftsQueryOptions,
  postDraftsByTaskQueryOptions,
  postKeys,
  type SubPostResult,
} from "./queries";

export function useAgentPostDrafts(taskId: string) {
  return useQuery(postDraftsByTaskQueryOptions(taskId));
}

/** Everything an agent wrote that is still waiting on your yes. */
export function usePendingPostDrafts() {
  return useQuery(pendingPostDraftsQueryOptions(useActiveTeamId()));
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

/** Pull a queued draft out of the auto-post queue before it fires. */
export function useCancelQueuedDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, results }: { id: string; results: SubPostResult[] }) =>
      cancelQueuedDraft(id, results),
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

/** Queue the selected subreddits to post spaced out, not all at once. */
export function useSchedulePostDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schedulePostDraft,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: postKeys.all }),
  });
}

/** Change when one queued sub-post goes out. */
export function useReschedulePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reschedulePost,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: postKeys.all });
      // The employee calendar reads drafts through its own deliverables query.
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

/** Move a single-destination draft (LinkedIn, Facebook) to a new time. */
export function useRescheduleDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, at }: { id: string; at: string }) => rescheduleDraft(id, at),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: postKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}
