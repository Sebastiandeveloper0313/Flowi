import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { approvalKeys } from "@/features/approvals/queries";
import { useActiveTeamId } from "@/features/workspace/active";
import { workspaceKeys } from "@/features/workspace/queries";

import { cancelScheduledLead, postLeadReplyNow, setLeadStatus, updateLeadDraft } from "./mutations";
import {
  type Lead,
  leadKeys,
  type LeadStatus,
  leadsByTaskQueryOptions,
  pendingLeadRepliesQueryOptions,
} from "./queries";

export function useAgentLeads(taskId: string) {
  return useQuery(leadsByTaskQueryOptions(taskId));
}

/** Reddit reply drafts across the workspace still waiting to be reviewed/posted. */
export function usePendingLeadReplies() {
  return useQuery(pendingLeadRepliesQueryOptions(useActiveTeamId()));
}

export function useSetLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      draftReply,
    }: {
      id: string;
      status: LeadStatus;
      draftReply?: string;
    }) => setLeadStatus(id, status, draftReply),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

/** Pull a scheduled auto-post reply back out of the drip queue, into New. */
export function useCancelScheduledLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelScheduledLead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

export function useUpdateLeadDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draftReply }: { id: string; draftReply: string }) =>
      updateLeadDraft(id, draftReply),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

/** Post a lead's reply to Reddit right now (the click is the approval). */
export function usePostLeadReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lead, text }: { lead: Lead; text: string }) => postLeadReplyNow(lead, text),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: leadKeys.all }),
        queryClient.invalidateQueries({ queryKey: approvalKeys.all }),
        queryClient.invalidateQueries({ queryKey: approvalKeys.pendingCount }),
        // a captured edit updates the learned reply samples
        queryClient.invalidateQueries({ queryKey: workspaceKeys.current }),
      ]),
  });
}
