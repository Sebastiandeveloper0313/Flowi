import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useUser } from "@/auth/hooks";
import { useConfirm } from "@/components/useConfirm";
import { useDeleteAccount, useUpdateProfileName } from "@/features/account/hooks";
import { CancelFlowDialog } from "@/features/billing/CancelFlow";
import {
  useBillingRedirect,
  useBillingSummary,
  useResumeSubscription,
  useSubscriptionDetails,
} from "@/features/billing/hooks";
import { PageHeader } from "@/features/dashboard/ui";
import { useProfile } from "@/features/onboarding/hooks";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flowy-page">
      <PageHeader
        title="Settings"
        subtitle="Billing and your account. What the team knows lives in Brain."
      />

      <Tabs defaultValue="billing">
        <TabsList className="mb-6">
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>
        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const USAGE_LABELS: Record<string, string> = {
  chat: "Chat messages today",
  analyze_website: "Website analyses today",
};

function BillingTab() {
  const { data, isLoading } = useBillingSummary();
  const redirect = useBillingRedirect();
  const isInternal = data?.plan === "internal";
  const isPro = data?.plan === "pro";
  const { data: sub } = useSubscriptionDetails(isPro);
  const resume = useResumeSubscription();
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelPending = Boolean(sub?.cancel_at_period_end);
  const ws = data?.workspaces;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <div className="text-muted-foreground text-sm">Current plan</div>
            <div className="mt-0.5 text-2xl font-bold">
              {isLoading ? "…" : isInternal ? "Internal" : isPro ? "Pro" : "Free"}
            </div>
            {isPro && ws && ws.billable > 0 && (
              <div className="text-muted-foreground mt-0.5 text-sm">
                {ws.total} workspaces · +${ws.billable * ws.addon_monthly}/mo for {ws.billable}{" "}
                beyond the first
              </div>
            )}
            <div className="text-muted-foreground text-sm">
              {isInternal
                ? "Sentrive staff account. Nothing to bill, no usage limits."
                : isPro
                  ? cancelPending
                    ? `Cancels ${
                        sub?.current_period_end
                          ? `on ${new Date(sub.current_period_end * 1000).toLocaleDateString(
                              undefined,
                              { month: "long", day: "numeric" },
                            )}`
                          : "at the end of the billing period"
                      }. Resume to keep your agents running.`
                    : `$49 / month${data?.subscription_status === "trialing" ? " · free trial" : data?.subscription_status && data.subscription_status !== "active" ? ` · ${data.subscription_status}` : ""}`
                  : data?.subscription_status
                    ? "Resubscribe for 10x higher daily limits."
                    : "Try Pro free for 3 days. Cancel anytime."}
            </div>
          </div>
          {isInternal ? null : isPro ? (
            <div className="flex items-center gap-2">
              {cancelPending && (
                <Button disabled={resume.isPending} onClick={() => resume.mutate(undefined)}>
                  {resume.isPending && <Loader2 className="size-4 animate-spin" />}
                  Resume plan
                </Button>
              )}
              <Button
                variant="outline"
                disabled={redirect.isPending}
                onClick={() => redirect.mutate("portal")}
              >
                {redirect.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Manage billing
              </Button>
            </div>
          ) : (
            <Button disabled={redirect.isPending} onClick={() => redirect.mutate("checkout")}>
              {redirect.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {data?.subscription_status ? "Resubscribe · $49/mo" : "Start 3-day free trial"}
            </Button>
          )}
        </CardContent>
      </Card>

      {redirect.isError && (
        <p className="text-destructive text-sm">
          {(redirect.error as Error)?.message || "Couldn't open billing. Try again."}
        </p>
      )}
      {resume.isError && (
        <p className="text-destructive text-sm">
          {(resume.error as Error)?.message || "Couldn't resume the plan. Try again."}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(data?.limits ?? {}).map(([kind, limit]) => {
            const used = data?.usage?.[kind] ?? 0;
            const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
            return (
              <div key={kind}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{USAGE_LABELS[kind] ?? kind}</span>
                  <span className="text-muted-foreground">
                    {used} / {limit}
                  </span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full ${pct >= 90 ? "bg-rose-500" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {!isLoading && !Object.keys(data?.limits ?? {}).length && (
            <p className="text-muted-foreground text-sm">No usage yet today.</p>
          )}
        </CardContent>
      </Card>

      {isPro && !cancelPending && (
        <p className="text-muted-foreground text-sm">
          Don't need Sentrive anymore?{" "}
          <button
            type="button"
            className="hover:text-foreground underline underline-offset-4"
            onClick={() => setCancelOpen(true)}
          >
            Cancel your subscription
          </button>
        </p>
      )}
      <CancelFlowDialog open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}

function AccountTab() {
  const { data: user } = useUser();
  const { data: profile } = useProfile();
  const updateName = useUpdateProfileName();
  const deleteAccount = useDeleteAccount();
  const { confirm, dialog } = useConfirm();

  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setName(profile?.full_name ?? "");
    setDirty(false);
  }, [profile]);

  async function onDelete() {
    const ok = await confirm({
      title: "Delete your account?",
      description:
        "This permanently deletes your account, every workspace you own, all agents, leads, and chats, and cancels your subscription. This cannot be undone.",
      confirmLabel: "Delete everything",
      destructive: true,
    });
    if (ok) deleteAccount.mutate();
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <label htmlFor="acc-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="acc-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              placeholder="Your name"
              className="max-w-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="acc-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="acc-email"
              value={user?.email ?? ""}
              readOnly
              disabled
              className="max-w-sm"
            />
            <p className="text-muted-foreground text-xs">
              Your login email. Contact support to change it.
            </p>
          </div>
          <Button
            size="sm"
            disabled={!dirty || updateName.isPending}
            onClick={() => updateName.mutate(name, { onSuccess: () => setDirty(false) })}
          >
            {updateName.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Save changes
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-rose-600">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Permanently delete your account, workspaces, and agents. Cancels your subscription. This
            can't be undone.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="border-rose-200 text-rose-600 hover:bg-rose-50"
            disabled={deleteAccount.isPending}
            onClick={onDelete}
          >
            {deleteAccount.isPending && <Loader2 className="size-4 animate-spin" />}
            Delete account
          </Button>
          {deleteAccount.isError && (
            <p className="text-destructive w-full text-xs">
              {(deleteAccount.error as Error)?.message || "Couldn't delete the account. Try again."}
            </p>
          )}
        </CardContent>
      </Card>
      {dialog}
    </div>
  );
}
