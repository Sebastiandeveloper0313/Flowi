import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  Upload,
  UserX,
} from "lucide-react";
import { useRef, useState } from "react";

import { useConfirm } from "@/components/useConfirm";
import { DocumentsCard } from "@/features/brain/DocumentsCard";
import {
  uploadAgentAvatar,
  useDeleteCustomAgent,
  useUpdateCustomAgent,
} from "@/features/employees/customAgents";
import { toolkitLogo, toolkitName } from "@/features/integrations/ConnectCta";
import { useConnectIntegration, useIntegrations } from "@/features/integrations/hooks";
import { scheduleLabel, useBulkDeleteTasks } from "@/features/tasks/hooks";
import type { Task } from "@/features/tasks/queries";
import { TaskStatusBadge } from "@/features/tasks/ui";
import { useActiveTeamId } from "@/features/workspace/active";
import { track } from "@/integrations/posthog";

import { EmployeeAvatar } from "./EmployeeAvatar";
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
  const fire = useBulkDeleteTasks();
  const removeCustom = useDeleteCustomAgent();
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();

  async function onFire() {
    const ok = await confirm({
      title: `Remove ${meta.name}?`,
      description: meta.custom
        ? `${meta.name} is deleted along with all ${mine.length} agent${mine.length === 1 ? "" : "s"}. Everything already delivered stays.`
        : `All of ${meta.name}'s agents stop and are deleted. Everything already delivered (leads, posts, run history) stays. You can hire ${meta.name} again anytime, with a fresh setup.`,
      confirmLabel: `Remove ${meta.name}`,
      destructive: true,
    });
    if (!ok) return;
    fire.mutate(
      mine.map((t) => t.id),
      {
        onSuccess: () => {
          // A custom agent IS its row; removing it retires the roster card too.
          if (meta.custom) removeCustom.mutate(meta.role);
          track("employee_fired", { role: meta.role, skills: mine.length, custom: !!meta.custom });
          void navigate({ to: "/team" });
        },
      },
    );
  }

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
      {meta.custom && (
        <div className="lg:col-span-2">
          <AppearanceCard meta={meta} />
        </div>
      )}

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

      {/* Their personal shelf: docs only this employee grounds their work in,
          on top of everything in the shared Brain. */}
      <div className="lg:col-span-2">
        <DocumentsCard owner={{ role: meta.role, name: meta.name }} />
      </div>

      {/* Letting someone go: the counterpart of hiring. Their skills stop and
          are deleted; delivered work stays; the role returns to the roster as
          a candidate you can re-hire with a fresh interview. */}
      <Card className="self-start lg:col-span-2">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Remove {meta.name}</p>
            <p className="text-muted-foreground text-sm">
              Stops and removes all {mine.length} of {meta.name}'s agent
              {mine.length === 1 ? "" : "s"}. Delivered work stays. You can always hire {meta.name}{" "}
              again.
            </p>
          </div>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/5 hover:text-destructive border-destructive/30"
            disabled={fire.isPending || (mine.length === 0 && !meta.custom)}
            onClick={() => void onFire()}
          >
            {fire.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserX className="size-4" />
            )}
            Remove {meta.name}
          </Button>
          {fire.isError && (
            <p className="text-destructive w-full text-xs">
              {(fire.error as Error)?.message || "Couldn't do that. Try again."}
            </p>
          )}
        </CardContent>
      </Card>
      {dialog}
    </div>
  );
}

/**
 * How a custom employee looks and is named: upload a real picture, use an
 * emoji, or neither (a clean initial). Only shown for employees the user
 * created; the ready-made cast keeps its illustrated characters.
 */
function AppearanceCard({ meta }: { meta: EmployeeMeta }) {
  const teamId = useActiveTeamId();
  const update = useUpdateCustomAgent();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(meta.name);
  const [title, setTitle] = useState(meta.title);
  const [dirty, setDirty] = useState(false);

  async function onPick(file: File) {
    if (!teamId) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadAgentAvatar(teamId, file);
      update.mutate({ id: meta.role, patch: { avatar_url: url, emoji: "" } });
    } catch (e) {
      setError((e as Error).message || "Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Name and picture</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <EmployeeAvatar meta={meta} className="size-14 rounded-2xl text-xl" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
              e.target.value = "";
            }}
          />
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            placeholder="Name"
            className="h-9 w-36 text-sm"
          />
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            placeholder="Role"
            className="h-9 w-44 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            {meta.avatar ? "Replace picture" : "Upload picture"}
          </Button>
          {meta.avatar && (
            <button
              type="button"
              onClick={() => update.mutate({ id: meta.role, patch: { avatar_url: null } })}
              className="text-muted-foreground hover:text-foreground text-xs font-medium"
            >
              Remove picture
            </button>
          )}
          {dirty && (
            <Button
              size="sm"
              disabled={update.isPending || !name.trim()}
              onClick={() =>
                update.mutate(
                  { id: meta.role, patch: { name: name.trim(), title: title.trim() } },
                  { onSuccess: () => setDirty(false) },
                )
              }
            >
              <Check className="size-3.5" /> Save
            </Button>
          )}
        </div>
        {error && <p className="text-destructive w-full text-xs">{error}</p>}
      </CardContent>
    </Card>
  );
}
