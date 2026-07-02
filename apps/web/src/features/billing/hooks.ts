import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface BillingSummary {
  plan: "free" | "pro";
  subscription_status: string | null;
  usage: Record<string, number>;
  limits: Record<string, number>;
}

export const billingKeys = {
  summary: ["billing", "summary"] as const,
};

async function billing<T>(action: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("billing", { body: { action } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useBillingSummary() {
  return useQuery({
    queryKey: billingKeys.summary,
    queryFn: () => billing<BillingSummary>("summary"),
    staleTime: 30_000,
  });
}

/** Open Stripe Checkout (upgrade) or the Billing Portal (manage/cancel). */
export function useBillingRedirect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: "checkout" | "portal") => {
      const { url } = await billing<{ url: string }>(action);
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: billingKeys.summary }),
  });
}
