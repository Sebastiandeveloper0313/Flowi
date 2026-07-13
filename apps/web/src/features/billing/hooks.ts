import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { track } from "@/integrations/posthog";
import { supabase } from "@/integrations/supabase/client";

export interface BillingSummary {
  plan: "free" | "pro";
  subscription_status: string | null;
  usage: Record<string, number>;
  limits: Record<string, number>;
}

export interface SubscriptionDetails {
  none?: boolean;
  cancel_at_period_end?: boolean;
  current_period_end?: number | null;
  retention_offer_used?: boolean;
  offer?: { percent_off: number; months: number };
}

export const billingKeys = {
  summary: ["billing", "summary"] as const,
  subscription: ["billing", "subscription"] as const,
};

async function billing<T>(action: string, extra?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("billing", {
    body: { action, ...extra },
  });
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

/** One-shot summary fetch, for polling outside react-query (trial activation). */
export function fetchBillingSummary(): Promise<BillingSummary> {
  return billing<BillingSummary>("summary");
}

/** Start the trial checkout in the same tab (hard paywall flow). */
export async function startTrialCheckout(): Promise<void> {
  track("trial_checkout_started");
  const { url } = await billing<{ url: string }>("checkout");
  window.location.assign(url);
}

/** Live subscription state (pending cancellation, offer already used). */
export function useSubscriptionDetails(enabled = true) {
  return useQuery({
    queryKey: billingKeys.subscription,
    queryFn: () => billing<SubscriptionDetails>("subscription"),
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

function useBillingMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, event: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_result, args) => {
      track(event, typeof args === "object" && args !== null ? (args as object) : undefined);
      void queryClient.invalidateQueries({ queryKey: billingKeys.summary });
      void queryClient.invalidateQueries({ queryKey: billingKeys.subscription });
    },
  });
}

/** Accept the save offer: discount applied to the subscription right away. */
export function useRetentionOffer() {
  return useBillingMutation(
    () => billing<{ ok: true; percent_off: number; months: number }>("retention_offer"),
    "retention_offer_accepted",
  );
}

/** Schedule the cancellation for the end of the billing period. */
export function useCancelSubscription() {
  return useBillingMutation(
    ({ reason }: { reason?: string }) =>
      billing<{ ok: true; current_period_end: number | null }>("cancel", { reason }),
    "subscription_cancel_scheduled",
  );
}

/** Undo a scheduled cancellation. */
export function useResumeSubscription() {
  return useBillingMutation(() => billing<{ ok: true }>("resume"), "subscription_resumed");
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
