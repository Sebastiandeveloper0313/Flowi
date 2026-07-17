import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { ArrowUpRight, CalendarClock, Check, ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";

import { toolkitLogo, toolkitName } from "@/features/integrations/ConnectCta";
import { useConnectIntegration, useIntegrations } from "@/features/integrations/hooks";
import { scheduleLabel } from "@/features/tasks/hooks";
import type { Task } from "@/features/tasks/queries";
import { TaskStatusBadge } from "@/features/tasks/ui";

import type { EmployeeMeta } from "./roles";

// Slugs the shared toolkit-name map doesn't know (they aren't Composio apps).
const EXTRA_NAMES: Record<string, string> = { wordpress: "WordPress", webhook: "Custom website" };
// These connect through their own dialog on the Integrations page, not OAuth.
const DIALOG_SLUGS = new Set(["wordpress", "webhook", "slack"]);
// Everything connectable today; the role's own stack leads, the rest expands.
const ALL_CONNECTABLE = [
  "gmail",
  "reddit",
  "linkedin",
  "facebook",
  "slack",
  "wordpress",
  "webhook",
];

/**
 * The employee's Settings tab: the accounts they work through (connect right
 * here) and each agent's schedule (full tuning happens on the agent page).
 */
export function EmployeeSettings({ meta, mine }: { meta: EmployeeMeta; mine: Task[] }) {
  const { data: toolkits } = useIntegrations();
  const connect = useConnectIntegration();
  const [showMore, setShowMore] = useState(false);
  const more = ALL_CONNECTABLE.filter((s) => !meta.relevantToolkits.includes(s));

  async function onConnect(slug: string) {
    try {
      const { redirect_url } = await connect.mutateAsync(slug);
      window.open(redirect_url, "_blank", "noopener,noreferrer");
    } catch {
      /* surfaced via connect.isError below */
    }
  }

  function ToolRow({ slug }: { slug: string }) {
    const connected = toolkits?.find((t) => t.slug === slug)?.connected ?? false;
    const name = toolkitName(slug) !== slug ? toolkitName(slug) : (EXTRA_NAMES[slug] ?? slug);
    return (
      <div className="bg-muted/30 flex items-center gap-3 rounded-xl border px-3.5 py-2.5">
        <img
          src={toolkitLogo(slug)}
          alt=""
          className="ring-border size-8 rounded-lg bg-white object-contain p-1 ring-1"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <Check className="size-3" /> Connected
          </span>
        ) : DIALOG_SLUGS.has(slug) ? (
          <Button size="sm" variant="outline" asChild>
            <Link to="/integrations">
              Connect <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={connect.isPending}
            onClick={() => void onConnect(slug)}
          >
            <ExternalLink className="size-3.5" /> Connect
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="self-start">
        <CardHeader>
          <CardTitle className="text-base">Connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground -mt-2 mb-3 text-sm">
            The accounts {meta.name} works through. Connections are shared across your whole
            workspace.
          </p>
          {meta.relevantToolkits.map((slug) => (
            <ToolRow key={slug} slug={slug} />
          ))}
          {more.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1.5 py-1.5 text-sm font-medium transition"
              >
                See more tools ({more.length})
                <ChevronDown
                  className={`size-4 transition-transform ${showMore ? "rotate-180" : ""}`}
                />
              </button>
              {showMore && more.map((slug) => <ToolRow key={slug} slug={slug} />)}
            </>
          )}
          {connect.isError && (
            <p className="text-destructive text-xs">
              {(connect.error as Error)?.message || "Couldn't start the connection."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="self-start">
        <CardHeader>
          <CardTitle className="text-base">Schedules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground -mt-2 mb-3 text-sm">
            When each of {meta.name}'s agents runs. Open one to change its schedule, instructions,
            or autonomy.
          </p>
          {mine.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">No agents yet.</p>
          ) : (
            mine.map((t) => (
              <Link
                key={t.id}
                to="/agents/$agentId"
                params={{ agentId: t.id }}
                className="bg-muted/30 hover:border-primary/40 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 transition"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    <CalendarClock className="size-3" /> {scheduleLabel(t.schedule_cron)}
                  </p>
                </div>
                <TaskStatusBadge status={t.status} />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
