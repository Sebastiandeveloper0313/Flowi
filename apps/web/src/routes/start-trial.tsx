import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/auth/components/auth-shell";
import { userQueryOptions } from "@/auth/queries";

import "@/components/cta-button.css";
import { fetchBillingSummary, startTrialCheckout } from "@/features/billing/hooks";
import { onboardingKeys, workspaceQueryOptions } from "@/features/onboarding/queries";

export const Route = createFileRoute("/start-trial")({
  validateSearch: (search: Record<string, unknown>) => ({
    billing: typeof search.billing === "string" ? search.billing : undefined,
  }),
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(userQueryOptions).catch(() => null);
    if (!user) throw redirect({ to: "/auth/login" });

    const ws = await context.queryClient.ensureQueryData(workspaceQueryOptions).catch(() => null);
    if (ws && !ws.onboarding_completed) throw redirect({ to: "/onboarding" });
    if (ws?.plan === "pro" || ws?.plan === "internal") throw redirect({ to: "/dashboard" });
  },
  component: StartTrialPage,
});

const FEATURES = [
  "300 AI chats per day",
  "20 website analyses per day",
  "Unlimited agents and schedules",
  "Gmail, Reddit, LinkedIn, Facebook and Slack",
  "You approve every send",
];

function StartTrialPage() {
  const { billing } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activating = billing === "success";
  const stopped = useRef(false);

  // After Stripe checkout, poll until the webhook flips the plan, then enter the app.
  useEffect(() => {
    if (!activating) return;
    stopped.current = false;
    const tick = async () => {
      if (stopped.current) return;
      try {
        const summary = await fetchBillingSummary();
        if (summary.plan === "pro") {
          await queryClient.invalidateQueries({ queryKey: onboardingKeys.workspace });
          void navigate({ to: "/dashboard" });
          return;
        }
      } catch {
        // transient; keep polling
      }
      setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      stopped.current = true;
    };
  }, [activating, navigate, queryClient]);

  async function onStart() {
    setError(null);
    setPending(true);
    try {
      await startTrialCheckout(); // navigates to Stripe on success
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open checkout. Try again.");
      setPending(false);
    }
  }

  return (
    <AuthShell
      footer={
        <>
          Wrong account?{" "}
          <Link
            to="/auth/logout"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Sign out
          </Link>
        </>
      }
    >
      <Card className="w-full max-w-md">
        {activating ? (
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="text-primary size-6 animate-spin" />
            <p className="font-semibold">Activating your trial…</p>
            <p className="text-muted-foreground text-sm">
              This takes a few seconds. You'll be dropped into your dashboard automatically.
            </p>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">Start your 3-day free trial</CardTitle>
              <CardDescription>
                One plan, everything included. Cancel anytime before day 4 and you pay nothing.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">$49</span>
                <span className="text-muted-foreground text-sm">/ month after the trial</span>
              </div>

              <ul className="flex flex-col gap-2">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 shrink-0 text-emerald-600" />
                    {f}
                  </li>
                ))}
              </ul>

              {billing === "cancelled" && (
                <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
                  Checkout was cancelled. Start your trial to enter Sentrive.
                </p>
              )}
              {error && <p className="text-destructive text-sm">{error}</p>}

              <Button
                className="cta-beam h-12 w-full text-base font-semibold"
                onClick={onStart}
                disabled={pending}
              >
                <span className="flex items-center gap-2">
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  Start 3-day Free Trial
                </span>
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                Card required. You won't be charged during the trial, and you can cancel in one
                click from Settings.
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </AuthShell>
  );
}
