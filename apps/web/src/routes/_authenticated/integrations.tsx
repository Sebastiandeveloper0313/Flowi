import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { AlertTriangle, Check, ExternalLink, Loader2, PartyPopper, X } from "lucide-react";
import { useEffect, useState } from "react";

import { env } from "@/env";
import { PageHeader } from "@/features/dashboard/ui";
import {
  useConnectIntegration,
  useConnectWordpress,
  useDisconnectWordpress,
  useIntegrations,
} from "@/features/integrations/hooks";
import { useMyTeam } from "@/features/tasks/hooks";

export const Route = createFileRoute("/_authenticated/integrations")({
  component: IntegrationsPage,
});

interface AppMeta {
  slug: string;
  name: string;
  description: string;
  available: boolean;
}

// Gmail is live; the rest are one auth-config away (Composio supports 3,000+).
const APPS: AppMeta[] = [
  { slug: "gmail", name: "Gmail", description: "Read, search, and draft emails.", available: true },
  {
    slug: "reddit",
    name: "Reddit",
    description: "Find leads in relevant subreddits and reply.",
    available: true,
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    description: "Publish on-brand posts, as you or your company page.",
    available: true,
  },
  {
    slug: "facebook",
    name: "Facebook",
    description: "Post to your page and answer its inbox.",
    available: true,
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Chat with Sentrive right in your Slack workspace.",
    available: true,
  },
  {
    slug: "wordpress",
    name: "WordPress",
    description: "Your SEO agent publishes its articles straight to your blog.",
    available: true,
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    description: "Sync contacts, deals, and activity.",
    available: false,
  },
  {
    slug: "googleads",
    name: "Google Ads",
    description: "Audit campaigns and spot anomalies.",
    available: false,
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Read and write docs and databases.",
    available: false,
  },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    description: "Read schedules and prep briefings.",
    available: false,
  },
];

function logo(slug: string) {
  return `https://logos.composio.dev/api/${slug}`;
}

/** Result banner after the "Add to Slack" OAuth flow bounces back here. */
function SlackResultBanner() {
  const search = useSearch({ strict: false }) as { slack?: string; detail?: string };
  const navigate = useNavigate();
  if (!search?.slack) return null;

  const dismiss = () => void navigate({ to: "/integrations", search: {}, replace: true });
  const ok = search.slack === "connected";
  const cancelled = search.slack === "cancelled";

  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : cancelled
            ? "bg-muted/60 text-foreground"
            : "border-rose-200 bg-rose-50 text-rose-900"
      }`}
    >
      {ok ? (
        <PartyPopper className="mt-0.5 size-5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      )}
      <div className="min-w-0 flex-1 text-sm">
        {ok ? (
          <>
            <p className="font-semibold">Sentrive is in your Slack</p>
            <p className="mt-0.5">
              Open Slack, find <b>Sentrive</b> under Apps, and send it a message. It matches you by
              email, so use the same email in Slack as in your Sentrive account.
            </p>
          </>
        ) : cancelled ? (
          <p className="font-medium">Slack install cancelled.</p>
        ) : (
          <p className="font-medium">
            Slack install failed{search.detail ? `: ${search.detail}` : "."}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-black/5"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function IntegrationsPage() {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [wpOpen, setWpOpen] = useState(false);
  const { data: toolkits } = useIntegrations(connecting !== null);
  const { data: teamId } = useMyTeam();
  const connect = useConnectIntegration();

  const statusOf = (slug: string) => toolkits?.find((t) => t.slug === slug);

  // Stop polling once the toolkit we were connecting shows as connected.
  useEffect(() => {
    if (connecting && toolkits?.find((t) => t.slug === connecting)?.connected) setConnecting(null);
  }, [toolkits, connecting]);

  // Don't wait forever: if the user closes the OAuth tab, nothing reports back,
  // so give up after a while and restore the Connect button.
  useEffect(() => {
    if (!connecting) return;
    const t = setTimeout(() => setConnecting(null), 120_000);
    return () => clearTimeout(t);
  }, [connecting]);

  async function onConnect(slug: string) {
    // WordPress connects with site credentials (Application Password), not OAuth.
    if (slug === "wordpress") {
      setWpOpen(true);
      return;
    }
    // Slack is not a Composio toolkit: "Add to Slack" runs our own OAuth install.
    // The team id rides along as OAuth state so the install is credited to this
    // workspace (that's what flips the card to Connected).
    if (slug === "slack") {
      const state = teamId ? `?state=${encodeURIComponent(teamId)}` : "";
      window.open(
        `${env.VITE_SUPABASE_URL}/functions/v1/slack-oauth${state}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    try {
      const { redirect_url } = await connect.mutateAsync(slug);
      window.open(redirect_url, "_blank", "noopener,noreferrer");
      setConnecting(slug);
    } catch {
      /* surfaced below via connect.isError */
    }
  }

  return (
    <div className="flowy-page">
      <PageHeader
        title="Integrations"
        subtitle="Connect the tools your agents act on. Permissions are per-tool and shared across every agent."
      />

      <SlackResultBanner />

      {connect.isError && (
        <p className="text-destructive mb-4 text-sm">
          {(connect.error as Error)?.message || "Couldn't start the connection."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {APPS.map((app) => {
          const s = statusOf(app.slug);
          const isConnected = !!s?.connected;
          const isConnecting = connecting === app.slug;
          return (
            <Card key={app.slug} className={app.available ? "" : "opacity-60"}>
              <CardContent className="flex h-full flex-col p-5">
                <div className="flex items-start gap-3">
                  <img
                    src={logo(app.slug)}
                    alt=""
                    className="size-10 rounded-xl border bg-white object-contain p-1.5"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{app.name}</span>
                      {isConnected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <Check className="size-3" /> Connected
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-sm">{app.description}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {!app.available ? (
                    <span className="text-muted-foreground text-xs font-medium">Coming soon</span>
                  ) : isConnected ? (
                    <Button size="sm" variant="outline" onClick={() => onConnect(app.slug)}>
                      Reconnect
                    </Button>
                  ) : isConnecting ? (
                    <>
                      <Button size="sm" variant="outline" disabled>
                        <Loader2 className="size-4 animate-spin" /> Waiting for authorization…
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => setConnecting(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => onConnect(app.slug)}
                      disabled={connect.isPending}
                    >
                      <ExternalLink className="size-4" /> Connect
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-muted-foreground mt-6 text-xs">
        Connecting opens a secure authorization window. After you approve access, this page updates
        automatically. Agents only ever use your team's own connected accounts.
      </p>

      <WordpressDialog
        open={wpOpen}
        onOpenChange={setWpOpen}
        connected={!!statusOf("wordpress")?.connected}
      />
    </div>
  );
}

/**
 * Connect a WordPress site with an Application Password (built into WordPress
 * 5.6+). The server verifies the credentials against the site before saving,
 * and the password is stored encrypted, never shown again.
 */
function WordpressDialog({
  open,
  onOpenChange,
  connected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connected: boolean;
}) {
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const connect = useConnectWordpress();
  const disconnect = useDisconnectWordpress();

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      connect.reset();
      disconnect.reset();
      setAppPassword("");
    }, 300);
  }

  function onSubmit() {
    connect.mutate(
      { site_url: siteUrl.trim(), username: username.trim(), app_password: appPassword.trim() },
      { onSuccess: () => close() },
    );
  }

  const busy = connect.isPending || disconnect.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-lg font-bold tracking-tight">
          Connect your WordPress
        </DialogTitle>
        <p className="text-muted-foreground -mt-2 text-sm">
          Your SEO agent will save its articles straight into your blog: as drafts for you to
          review, or published automatically when the agent is on auto.
        </p>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <label htmlFor="wp-url" className="text-sm font-medium">
              Site URL
            </label>
            <Input
              id="wp-url"
              type="url"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://yourblog.com"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="wp-user" className="text-sm font-medium">
              WordPress username
            </label>
            <Input
              id="wp-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="wp-pass" className="text-sm font-medium">
              Application password
            </label>
            <Input
              id="wp-pass"
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx"
            />
            <p className="text-muted-foreground text-xs">
              Create one in your WordPress admin under Users, then Profile, then Application
              Passwords. It only grants what your user can do, and you can revoke it there anytime.
            </p>
          </div>
          {connect.isError && (
            <p className="text-destructive text-sm">
              {(connect.error as Error)?.message || "Couldn't connect. Check the details."}
            </p>
          )}
          {disconnect.isError && (
            <p className="text-destructive text-sm">
              {(disconnect.error as Error)?.message || "Couldn't disconnect. Try again."}
            </p>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          {connected ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => disconnect.mutate(undefined, { onSuccess: () => close() })}
            >
              {disconnect.isPending && <Loader2 className="size-4 animate-spin" />}
              Disconnect
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={busy || !siteUrl.trim() || !username.trim() || !appPassword.trim()}
              onClick={onSubmit}
            >
              {connect.isPending && <Loader2 className="size-4 animate-spin" />}
              {connected ? "Update connection" : "Connect"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
