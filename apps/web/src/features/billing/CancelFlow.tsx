import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowRight, BadgePercent, Check, Loader2 } from "lucide-react";
import { useState } from "react";

import { useCancelSubscription, useRetentionOffer, useSubscriptionDetails } from "./hooks";

const REASONS = [
  "It's too expensive",
  "Didn't get enough results",
  "Missing a feature I need",
  "Just testing Sentrive",
  "Something else",
];

function endDate(unix: number | null | undefined): string {
  if (!unix) return "the end of your billing period";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
}

/**
 * The cancellation journey: a save offer first (50% off for 2 months, applied
 * instantly), then reasons and a clean end-of-period cancel for those who
 * still want out. The offer can only be claimed once per subscription; the
 * server enforces it and we skip the step when it's spent.
 */
export function CancelFlowDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: sub, isLoading, isError } = useSubscriptionDetails(open);
  const offer = useRetentionOffer();
  const cancel = useCancelSubscription();
  const [step, setStep] = useState<"offer" | "confirm">("offer");
  const [reason, setReason] = useState<string | null>(null);

  const percent = sub?.offer?.percent_off ?? 50;
  const months = sub?.offer?.months ?? 2;
  const discounted = (49 * (1 - percent / 100)).toFixed(2).replace(/\.00$/, "");
  const offerAvailable = !sub?.retention_offer_used;

  function close() {
    onOpenChange(false);
    // reset for next open, after the exit animation
    setTimeout(() => {
      setStep("offer");
      setReason(null);
      offer.reset();
      cancel.reset();
    }, 300);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        className="gap-0 overflow-hidden rounded-3xl p-0 duration-300 sm:max-w-md"
        showCloseButton={false}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#5aa6ff]/15 to-transparent" />

        <div className="relative p-8">
          {isError || sub?.none ? (
            <>
              <DialogTitle className="text-xl font-bold tracking-tight">
                {sub?.none ? "No subscription to cancel" : "Couldn't load your subscription"}
              </DialogTitle>
              <p className="text-muted-foreground mt-1.5 text-sm">
                {sub?.none
                  ? "This workspace has no active subscription."
                  : "Try again in a moment, or manage your plan from the billing portal."}
              </p>
              <div className="mt-6 flex justify-end">
                <Button variant="outline" onClick={close}>
                  Close
                </Button>
              </div>
            </>
          ) : isLoading || !sub ? (
            <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" /> One moment…
            </p>
          ) : offer.isSuccess ? (
            <>
              <p className="mb-4 flex items-center gap-2 text-sm font-medium text-emerald-600">
                <Check className="size-4" /> Offer applied
              </p>
              <DialogTitle className="text-xl font-bold tracking-tight">
                You're paying ${discounted}/month for the next {months} months
              </DialogTitle>
              <p className="text-muted-foreground mt-1.5 text-sm">
                The discount is already on your subscription. Nothing else to do.
              </p>
              <div className="mt-6 flex justify-end">
                <Button onClick={close}>Back to Sentrive</Button>
              </div>
            </>
          ) : cancel.isSuccess ? (
            <>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Your plan ends on {endDate(cancel.data?.current_period_end)}
              </DialogTitle>
              <p className="text-muted-foreground mt-1.5 text-sm">
                Everything keeps working until then, and your agents' setups are kept. You can
                resume anytime from Settings.
              </p>
              <div className="mt-6 flex justify-end">
                <Button variant="outline" onClick={close}>
                  Done
                </Button>
              </div>
            </>
          ) : step === "offer" && offerAvailable ? (
            <>
              <span className="mb-5 grid size-11 place-items-center rounded-xl bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white shadow-lg shadow-[#1566e6]/25">
                <BadgePercent className="size-5" />
              </span>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Before you go: {percent}% off
              </DialogTitle>
              <p className="text-muted-foreground mt-1.5 text-sm">
                Stay and pay ${discounted}/month instead of $49 for your next {months} months. Your
                agents keep running, and the discount applies the moment you claim it.
              </p>
              {offer.isError && (
                <p className="text-destructive mt-3 text-sm">
                  {(offer.error as Error)?.message || "Couldn't apply the offer. Try again."}
                </p>
              )}
              <div className="mt-6 flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setStep("confirm")}
                >
                  Continue to cancel
                </Button>
                <Button disabled={offer.isPending} onClick={() => offer.mutate(undefined)}>
                  {offer.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <BadgePercent className="size-4" />
                  )}
                  Claim {percent}% off
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Cancel your subscription?
              </DialogTitle>
              <p className="text-muted-foreground mt-1.5 text-sm">
                Your plan stays active until {endDate(sub.current_period_end)}, then your agents
                stop running. Mind telling us why you're leaving?
              </p>

              <div className="mt-4 flex flex-col gap-1.5">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r === reason ? null : r)}
                    className={`rounded-lg border px-3.5 py-2 text-left text-sm transition-colors ${
                      reason === r
                        ? "border-primary/50 bg-primary/5 font-medium"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {cancel.isError && (
                <p className="text-destructive mt-3 text-sm">
                  {(cancel.error as Error)?.message || "Couldn't cancel. Try again."}
                </p>
              )}

              <div className="mt-6 flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate({ reason: reason ?? undefined })}
                >
                  {cancel.isPending && <Loader2 className="size-4 animate-spin" />}
                  Cancel subscription
                </Button>
                <Button onClick={close}>
                  Keep my plan <ArrowRight className="size-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
