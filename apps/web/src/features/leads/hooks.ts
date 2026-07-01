import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { approvalKeys } from "@/features/approvals/queries";

import { queueLeadReply, setLeadStatus, updateLeadDraft } from "./mutations";
import { type Lead, leadKeys, type LeadStatus, leadsByTaskQueryOptions } from "./queries";

export function useAgentLeads(taskId: string) {
  return useQuery(leadsByTaskQueryOptions(taskId));
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

export function useUpdateLeadDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draftReply }: { id: string; draftReply: string }) =>
      updateLeadDraft(id, draftReply),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

/** Queue a lead's reply as an approval to post on Reddit. */
export function useQueueLeadReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lead, text }: { lead: Lead; text: string }) => queueLeadReply(lead, text),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: leadKeys.all }),
        queryClient.invalidateQueries({ queryKey: approvalKeys.all }),
        queryClient.invalidateQueries({ queryKey: approvalKeys.pendingCount }),
      ]),
  });
}
