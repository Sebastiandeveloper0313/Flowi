import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/features/dashboard/ui";
import { useConnectIntegration, useIntegrations } from "@/features/integrations/hooks";

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
    slug: "hubspot",
    name: "HubSpot",
    description: "Sync contacts, deals, and activity.",
    available: false,
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Deliver work where your team is.",
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

function IntegrationsPage() {
  const [connecting, setConnecting] = useState<string | null>(null);
  const { data: toolkits } = useIntegrations(connecting !== null);
  const connect = useConnectIntegration();

  const statusOf = (slug: string) => toolkits?.find((t) => t.slug === slug);

  // Stop polling once the toolkit we were connecting shows as connected.
  useEffect(() => {
    if (connecting && toolkits?.find((t) => t.slug === connecting)?.connected) setConnecting(null);
  }, [toolkits, connecting]);

  async function onConnect(slug: string) {
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
                    <Button size="sm" variant="outline" disabled>
                      <Loader2 className="size-4 animate-spin" /> Waiting for authorization…
                    </Button>
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
    </div>
  );
}
