import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { setLeadStatus, updateLeadDraft } from "./mutations";
import { leadKeys, type LeadStatus, leadsQueryOptions } from "./queries";

export function useLeads() {
  return useQuery(leadsQueryOptions);
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
