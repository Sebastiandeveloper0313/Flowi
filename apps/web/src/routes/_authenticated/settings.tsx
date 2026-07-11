import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  AlertTriangle,
  Brain,
  Check,
  Globe,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
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
import type { BusinessContext } from "@/features/onboarding/mutations";
import { useTasks } from "@/features/tasks/hooks";
import {
  useAnalyzeWebsite,
  useSaveBusinessContext,
  useUpdateAutoPostPacing,
  useUpdateReplyInstructions,
  useWorkspace,
} from "@/features/workspace/hooks";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flowy-page">
      <PageHeader
        title="Settings"
        subtitle="What Sentrive knows about your business, billing, and your account."
      />

      <Tabs defaultValue="business">
        <TabsList className="mb-6">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <BusinessTab />
        </TabsContent>
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

const FIELDS: { key: keyof BusinessContext; label: string; hint: string; rows: number }[] = [
  { key: "summary", label: "Summary", hint: "What the business is, in a sentence or two", rows: 2 },
  { key: "what_they_do", label: "What you do", hint: "What you actually sell or offer", rows: 2 },
  { key: "product", label: "Product", hint: "The core product and its value", rows: 2 },
  {
    key: "audience",
    label: "Audience (ICP)",
    hint: "Who your customers are, specifically",
    rows: 2,
  },
  {
    key: "positioning",
    label: "Positioning",
    hint: "How you're different from alternatives",
    rows: 2,
  },
];

function BusinessTab() {
  const { data: ws, isLoading } = useWorkspace();
  const { data: tasks } = useTasks();
  const analyze = useAnalyzeWebsite();
  const save = useSaveBusinessContext();

  // The reply-style and pacing cards only make sense to someone running a Reddit
  // agent; hide them from everyone else so Settings isn't full of dead knobs.
  const hasReddit = (tasks ?? []).some(
    (t) => t.kind === "reddit_monitor" || t.kind === "reddit_post",
  );
  const [url, setUrl] = useState("");
  const [ctx, setCtx] = useState<BusinessContext>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!ws) return;
    setUrl(ws.website_url ?? "");
    setCtx((ws.business_context as BusinessContext | null) ?? {});
    setDirty(false);
  }, [ws]);

  function setField<K extends keyof BusinessContext>(k: K, v: BusinessContext[K]) {
    setCtx((c) => ({ ...c, [k]: v }));
    setDirty(true);
  }

  function onAnalyze() {
    const u = url.trim();
    if (!u) return;
    analyze.mutate(u, {
      onSuccess: (context) => {
        setCtx(context);
        setDirty(false);
      },
    });
  }

  function onSave() {
    if (!ws) return;
    save.mutate(
      { teamId: ws.id, context: ctx, websiteUrl: url.trim() || undefined },
      { onSuccess: () => setDirty(false) },
    );
  }

  const hasContext = !!(ctx.summary || ctx.what_they_do || ctx.product || ctx.audience);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-[#bcd6f2] bg-[#eef4fd] p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white">
          <Brain className="size-5" />
        </span>
        <div>
          <p className="font-semibold">This is what Sentrive knows about your business.</p>
          <p className="text-muted-foreground text-sm">
            Every agent and reply is grounded in this. Paste your website and Sentrive reads it and
            fills this in for you, or edit anything by hand.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analyze your website</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Globe className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onAnalyze();
                }}
                placeholder="https://yourcompany.com"
                className="h-10 pl-9"
                disabled={analyze.isPending}
              />
            </div>
            <Button
              className="h-10 sm:w-auto"
              onClick={onAnalyze}
              disabled={analyze.isPending || !url.trim()}
            >
              {analyze.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Reading your site…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Analyze
                </>
              )}
            </Button>
          </div>
          {analyze.isPending && (
            <p className="text-muted-foreground text-xs">
              Sentrive is reading your pages. This can take up to a minute.
            </p>
          )}
          {analyze.isError && (
            <p className="text-destructive flex items-center gap-1.5 text-xs">
              <AlertTriangle className="size-3.5" />
              {(analyze.error as Error).message || "Couldn't analyze that site. Try again."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Business context</CardTitle>
          <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending || !ws}>
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Save
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {!hasContext && (
                <p className="text-muted-foreground text-sm">
                  Nothing yet. Paste your website above and Sentrive will fill this in, or type it
                  in manually.
                </p>
              )}

              {FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1.5">
                  <label htmlFor={`bc-${f.key}`} className="text-sm font-medium">
                    {f.label}
                  </label>
                  <Textarea
                    id={`bc-${f.key}`}
                    value={(ctx[f.key] as string) ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.hint}
                    rows={f.rows}
                    className="resize-y text-sm"
                  />
                </div>
              ))}

              <div className="grid gap-1.5">
                <label htmlFor="bc-voice" className="text-sm font-medium">
                  Voice
                </label>
                <Input
                  id="bc-voice"
                  value={ctx.voice ?? ""}
                  onChange={(e) => setField("voice", e.target.value)}
                  placeholder="e.g. bold, technical, no fluff"
                  className="text-sm"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="bc-keywords" className="text-sm font-medium">
                  Keywords
                </label>
                <Input
                  id="bc-keywords"
                  value={(ctx.keywords ?? []).join(", ")}
                  onChange={(e) =>
                    setField(
                      "keywords",
                      e.target.value
                        .split(",")
                        .map((k) => k.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="comma, separated, themes"
                  className="text-sm"
                />
                {(ctx.keywords ?? []).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(ctx.keywords ?? []).map((k) => (
                      <span
                        key={k}
                        className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {hasReddit && (
        <>
          <ReplyStyleCard />
          <AutoPostPacingCard />
        </>
      )}
    </div>
  );
}

/**
 * How fast Auto mode posts Reddit replies. Auto mode never bursts: it drips
 * replies out one at a time, spaced apart, under a daily cap. These are the two
 * knobs, so users can keep it well inside what their account can safely handle.
 */
function AutoPostPacingCard() {
  const { data: ws } = useWorkspace();
  const update = useUpdateAutoPostPacing();
  const [perDay, setPerDay] = useState(10);
  const [gap, setGap] = useState(8);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (ws) {
      setPerDay(ws.auto_post_per_day ?? 10);
      setGap(ws.auto_post_gap_minutes ?? 8);
      setDirty(false);
    }
  }, [ws]);

  const clampedPerDay = Math.max(0, Math.min(100, Math.round(perDay || 0)));
  const clampedGap = Math.max(1, Math.min(240, Math.round(gap || 0)));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" /> Reddit auto-post pacing
        </CardTitle>
        <Button
          size="sm"
          disabled={!dirty || update.isPending || !ws}
          onClick={() =>
            ws &&
            update.mutate(
              { teamId: ws.id, perDay: clampedPerDay, gapMinutes: clampedGap },
              { onSuccess: () => setDirty(false) },
            )
          }
        >
          {update.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Save
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          When Auto mode is on, Sentrive never posts replies all at once, that's how accounts get
          flagged. It spaces them out and drips them to Reddit one at a time. These limits keep it
          gentle; lower them if your account is new.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="ap-per-day" className="text-sm font-medium">
              Max replies per day
            </label>
            <Input
              id="ap-per-day"
              type="number"
              min={0}
              max={100}
              value={perDay}
              onChange={(e) => {
                setPerDay(e.target.valueAsNumber);
                setDirty(true);
              }}
              className="max-w-[9rem] text-sm"
            />
            <p className="text-muted-foreground text-xs">
              A hard ceiling across all your lead agents. Set 0 to pause auto-posting.
            </p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="ap-gap" className="text-sm font-medium">
              Minutes between replies
            </label>
            <Input
              id="ap-gap"
              type="number"
              min={1}
              max={240}
              value={gap}
              onChange={(e) => {
                setGap(e.target.valueAsNumber);
                setDirty(true);
              }}
              className="max-w-[9rem] text-sm"
            />
            <p className="text-muted-foreground text-xs">
              The gap Sentrive waits between posts (it adds a little randomness on top).
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * How the user's Reddit replies should sound. Explicit up-front instructions
 * plus a live count of the drafts they've refined, which Sentrive learns from.
 */
function ReplyStyleCard() {
  const { data: ws } = useWorkspace();
  const update = useUpdateReplyInstructions();
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (ws) {
      setText(ws.reply_instructions ?? "");
      setDirty(false);
    }
  }, [ws]);

  const learned = Array.isArray(ws?.reply_samples) ? ws.reply_samples.length : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4" /> Reddit reply style
        </CardTitle>
        <Button
          size="sm"
          disabled={!dirty || update.isPending || !ws}
          onClick={() =>
            ws &&
            update.mutate(
              { teamId: ws.id, instructions: text.trim() },
              { onSuccess: () => setDirty(false) },
            )
          }
        >
          {update.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Save
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Tell Sentrive how you want your Reddit replies to sound, so drafts match you from the
          start. For example: tone, length, whether to include your link, phrases to use or avoid.
        </p>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
          rows={4}
          placeholder={
            'e.g. "Keep it short and casual, lowercase, no emojis. Mention Sentrive naturally, only drop the link if someone asks for a tool. Never sound salesy."'
          }
          className="resize-y text-sm"
        />
        <div className="flex items-center gap-2 rounded-lg border border-[#3d82f5]/25 bg-[#3d82f5]/5 p-3 text-sm">
          <Sparkles className="size-4 shrink-0 text-[#3d82f5]" />
          <span className="text-muted-foreground">
            {learned > 0 ? (
              <>
                <span className="text-foreground font-medium">
                  Sentrive has learned from {learned} {learned === 1 ? "reply" : "replies"} you
                  refined.
                </span>{" "}
                Every time you edit a draft before posting, it gets a little more like you.
              </>
            ) : (
              <>
                <span className="text-foreground font-medium">Sentrive learns as you go.</span> When
                you edit a draft before posting, it picks up your voice for next time.
              </>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
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

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <div className="text-muted-foreground text-sm">Current plan</div>
            <div className="mt-0.5 text-2xl font-bold">
              {isLoading ? "…" : isInternal ? "Internal" : isPro ? "Pro" : "Free"}
            </div>
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
