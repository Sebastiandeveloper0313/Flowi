import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveTeamId } from "@/features/workspace/active";
import { supabase } from "@/integrations/supabase/client";

import { approvalKeys, approvalsQueryOptions, pendingApprovalCountQueryOptions } from "./queries";

export function useApprovals() {
  return useQuery(approvalsQueryOptions(useActiveTeamId()));
}

export function usePendingApprovalCount() {
  return useQuery(pendingApprovalCountQueryOptions(useActiveTeamId()));
}

/** Approve (execute) or reject a queued action via the approvals edge function. */
export function useDecideApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
      editedText,
    }: {
      id: string;
      decision: "approve" | "reject";
      editedText?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("approvals", {
        body: { approval_id: id, decision, edited_text: editedText },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { status: string };
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: approvalKeys.all }),
        queryClient.invalidateQueries({ queryKey: approvalKeys.pendingCount }),
      ]),
  });
}
