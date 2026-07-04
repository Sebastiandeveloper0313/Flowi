import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Textarea } from "@workspace/ui/components/textarea";
import { AlertTriangle, Brain, Check, Globe, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { useBillingRedirect, useBillingSummary } from "@/features/billing/hooks";
import { CHANNEL_LABELS, type Channel } from "@/features/dashboard/mock";
import { PageHeader } from "@/features/dashboard/ui";
import type { BusinessContext } from "@/features/onboarding/mutations";
import {
  useAnalyzeWebsite,
  useSaveBusinessContext,
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
        subtitle="What Sentrive knows about your business, channels, billing, and your account."
      />

      <Tabs defaultValue="business">
        <TabsList className="mb-6">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <BusinessTab />
        </TabsContent>
        <TabsContent value="channels">
          <ChannelsTab />
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
  const analyze = useAnalyzeWebsite();
  const save = useSaveBusinessContext();
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
    </div>
  );
}

function ChannelsTab() {
  const channels: { key: Channel; connected: boolean; detail: string }[] = [
    { key: "discord", connected: true, detail: "#results · Acme HQ" },
    { key: "telegram", connected: true, detail: "@acme_ops" },
    { key: "slack", connected: true, detail: "Acme HQ workspace" },
    { key: "whatsapp", connected: true, detail: "+1 (415) •••• 22" },
    { key: "email", connected: true, detail: "founder@acme.com" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Delivery channels</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {channels.map((c, i) => (
          <div
            key={c.key}
            className={`flex items-center justify-between py-3 ${i > 0 ? "border-t" : ""}`}
          >
            <div>
              <div className="text-sm font-medium">{CHANNEL_LABELS[c.key]}</div>
              <div className="text-muted-foreground text-xs">{c.detail}</div>
            </div>
            {c.connected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <Check className="size-3" /> Connected
              </span>
            ) : (
              <Button size="sm" variant="outline">
                Connect
              </Button>
            )}
          </div>
        ))}
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
  const isPro = data?.plan === "pro";

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <div className="text-muted-foreground text-sm">Current plan</div>
            <div className="mt-0.5 text-2xl font-bold">
              {isLoading ? "…" : isPro ? "Pro" : "Free"}
            </div>
            <div className="text-muted-foreground text-sm">
              {isPro
                ? `$49 / month${data?.subscription_status === "trialing" ? " · free trial" : data?.subscription_status && data.subscription_status !== "active" ? ` · ${data.subscription_status}` : ""}`
                : data?.subscription_status
                  ? "Resubscribe for 10x higher daily limits."
                  : "Try Pro free for 3 days. Cancel anytime."}
            </div>
          </div>
          {isPro ? (
            <Button
              variant="outline"
              disabled={redirect.isPending}
              onClick={() => redirect.mutate("portal")}
            >
              {redirect.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Manage billing
            </Button>
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
    </div>
  );
}

function AccountTab() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name" value="Sebastian" />
          <Field label="Email" value="founder@acme.com" />
          <Button size="sm">Save changes</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-rose-600">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Permanently delete your account and all agents.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="border-rose-200 text-rose-600 hover:bg-rose-50"
          >
            Delete account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      <Input defaultValue={value} className="max-w-sm" />
    </div>
  );
}
