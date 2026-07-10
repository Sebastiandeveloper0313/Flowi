import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Separator } from "@workspace/ui/components/separator";
import { Switch } from "@workspace/ui/components/switch";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
  Hash,
  Loader2,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  Sparkles,
  Target,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";

import { useConfirm } from "@/components/useConfirm";
import { useAutonomy } from "@/features/autonomy/hooks";
import { ChatMarkdown } from "@/features/chat/Markdown";
import { ConnectBanner } from "@/features/integrations/ConnectCta";
import { LeadsPanel } from "@/features/leads/LeadsPanel";
import { PostsPanel } from "@/features/posts/PostsPanel";
import { AgentGuide, useAgentGuide } from "@/features/tasks/AgentGuide";
import {
  CHANNELS,
  channelLabel,
  formatWhen,
  SCHEDULES,
  scheduleLabel,
  useDeleteTask,
  useRunTask,
  useSetTaskStatus,
  useTaskRuns,
  useTasks,
  useUpdateTaskAutonomy,
  useUpdateTaskChannel,
  useUpdateTaskConfig,
  useUpdateTaskSchedule,
} from "@/features/tasks/hooks";
import { PostMediaEditor } from "@/features/tasks/PostMediaEditor";
import type { Task, TaskRun } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";
import { RunDot, TaskStatusBadge } from "@/features/tasks/ui";

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  component: AgentDetailPage,
});

function AgentDetailPage() {
  const { agentId } = Route.useParams();
  const navigate = useNavigate();
  const { data: tasks, isLoading } = useTasks();
  const { data: runs } = useTaskRuns(agentId);
  const run = useRunTask();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();
  const { confirm, dialog } = useConfirm();

  const agent = tasks?.find((t) => t.id === agentId);
  const guide = useAgentGuide(agent);

  if (isLoading) {
    return (
      <div className="flowy-page">
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading agent…
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flowy-page">
        <p className="text-muted-foreground">This agent doesn't exist or was deleted.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/agents">
            <ArrowLeft className="size-4" /> All agents
          </Link>
        </Button>
      </div>
    );
  }

  const paused = agent.status === "paused";
  const running = run.isPending || (runs ?? []).some((r) => r.status === "running");
  const isReddit = agent.kind === "reddit_monitor";
  const isRedditPost = agent.kind === "reddit_post";
  // The conversation that created this agent (if it was made from chat), so
  // "Open chat" returns to it instead of starting a blank one.
  const agentChatId = (agent.config as { chat_id?: string } | null)?.chat_id;

  return (
    <div className="flowy-page">
      <Link
        to="/agents"
        className="text-muted-foreground hover:text-foreground mb-5 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> All agents
      </Link>

      <header className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{agent.title}</h1>
            <TaskStatusBadge status={agent.status} />
          </div>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-4" /> {scheduleLabel(agent.schedule_cron)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" /> Next: {formatWhen(agent.next_run_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <Hash className="size-4" /> {channelLabel(agent.channel)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* While the guide is up, it owns the run action; one run button at a time. */}
          {!guide.visible && (
            <Button size="sm" disabled={running} onClick={() => run.mutate(agent.id)}>
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {running ? "Running…" : "Run now"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: agent.id, status: paused ? "active" : "paused" })}
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={remove.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "Delete agent?",
                description: `“${agent.title}” will be permanently deleted. This can't be undone.`,
                confirmLabel: "Delete",
                destructive: true,
              });
              if (ok) remove.mutate(agent.id, { onSuccess: () => navigate({ to: "/agents" }) });
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      <AgentGuide
        agent={agent}
        visible={guide.visible}
        running={running}
        onDismiss={guide.dismiss}
      />

      <div className="mb-4 empty:hidden">
        <ConnectBanner
          toolkits={requiredToolkits(agent)}
          autoRunTaskId={runs && runs.length > 0 ? undefined : agent.id}
        />
      </div>

      {run.isError && (
        <p className="text-destructive mb-4 text-sm">
          {(run.error as Error).message || "Run failed."}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* left: leads (reddit) + instruction + run history */}
        <div className="space-y-5">
          {isReddit && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="size-4" /> Leads
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LeadsPanel taskId={agent.id} />
              </CardContent>
            </Card>
          )}

          {isRedditPost && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="size-4" /> Posts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PostsPanel taskId={agent.id} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Instruction</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{agent.instructions}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {!runs || runs.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No runs yet. Hit “Run now” to try it.
                </p>
              ) : (
                runs.map((r) => <RunRow key={r.id} run={r} defaultOpen={false} />)
              )}
            </CardContent>
          </Card>
        </div>

        {/* right: config */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ScheduleEditor agent={agent} />
              <Row label="Next run" value={formatWhen(agent.next_run_at)} />
              <Row label="Last run" value={formatWhen(agent.last_run_at)} />
              <Separator />
              <DeliveryEditor agent={agent} />
              <Separator />
              <AutonomyEditor agent={agent} isReddit={isReddit} />
              {agent.kind === "facebook_post" && (
                <>
                  <Separator />
                  <PostMediaEditor agent={agent} />
                </>
              )}
            </CardContent>
          </Card>

          {isReddit && <WatchingCard agent={agent} />}
          {isRedditPost && <SubredditsCard agent={agent} />}
          {!isReddit && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="size-4" /> Tools
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <span className="bg-muted inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium">
                  <Globe className="size-3.5" /> Web search
                </span>
              </CardContent>
            </Card>
          )}

          <Button variant="outline" className="w-full" asChild>
            <Link to="/dashboard" search={{ c: agentChatId ?? undefined }}>
              <MessageSquare className="size-4" /> {agentChatId ? "Open chat" : "New chat"}
            </Link>
          </Button>
        </div>
      </div>
      {dialog}
    </div>
  );
}

function RunRow({ run, defaultOpen }: { run: TaskRun; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition"
      >
        <RunDot status={run.status} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{run.summary ?? run.error ?? "Run"}</div>
          <div className="text-muted-foreground text-xs">{formatWhen(run.created_at)}</div>
        </div>
        {open ? (
          <ChevronUp className="text-muted-foreground size-4" />
        ) : (
          <ChevronDown className="text-muted-foreground size-4" />
        )}
      </button>
      {open && (
        <div className="text-foreground/80 max-h-96 overflow-auto border-t px-4 py-3.5">
          {run.output ? (
            <ChatMarkdown>{run.output}</ChatMarkdown>
          ) : (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {run.error ?? run.summary ?? "No output."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WatchingCard({ agent }: { agent: Task }) {
  const update = useUpdateTaskConfig();
  const cfg = (agent.config ?? {}) as {
    keywords?: string[];
    subreddits?: string[];
    keywords_source?: string;
  };
  const keywords = cfg.keywords ?? [];
  const subreddits = cfg.subreddits ?? [];
  const custom = cfg.keywords_source === "user";

  const [editing, setEditing] = useState(false);
  const [kw, setKw] = useState(keywords.join(", "));
  const [subs, setSubs] = useState(subreddits.join(", "));

  function startEdit() {
    setKw(keywords.join(", "));
    setSubs(subreddits.join(", "));
    setEditing(true);
  }

  function save() {
    const nextKw = kw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const nextSubs = subs
      .split(",")
      .map((s) => s.trim().replace(/^r\//i, ""))
      .filter(Boolean);
    update.mutate(
      {
        id: agent.id,
        config: { ...cfg, keywords: nextKw, subreddits: nextSubs, keywords_source: "user" },
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4" /> Watching
          </CardTitle>
          {!editing && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={startEdit}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <>
            <div>
              <span className="text-muted-foreground mb-1 block text-xs font-medium">
                Keywords (comma separated)
              </span>
              <Input value={kw} onChange={(e) => setKw(e.target.value)} className="text-sm" />
            </div>
            <div>
              <span className="text-muted-foreground mb-1 block text-xs font-medium">
                Subreddits (optional, comma separated)
              </span>
              <Input value={subs} onChange={(e) => setSubs(e.target.value)} className="text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={update.isPending}>
                <Check className="size-4" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="size-4" /> Cancel
              </Button>
            </div>
          </>
        ) : keywords.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Derived automatically from your business context on the first run. Edit to set your own.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {keywords.map((k) => (
                <span
                  key={k}
                  className="bg-muted inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium"
                >
                  {k}
                </span>
              ))}
            </div>
            {subreddits.length > 0 && (
              <div className="text-muted-foreground flex flex-wrap gap-1.5 text-xs">
                {subreddits.map((s) => (
                  <span key={s}>r/{s}</span>
                ))}
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              {custom ? "Custom (you set these)." : "Auto from your business context."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Subreddit targets + "let the AI pick" toggle for a Reddit poster. */
function SubredditsCard({ agent }: { agent: Task }) {
  const update = useUpdateTaskConfig();
  const cfg = (agent.config ?? {}) as { subreddits?: string[]; pick_subreddits?: boolean };
  const subreddits = cfg.subreddits ?? [];
  const pick = cfg.pick_subreddits !== false;

  const [editing, setEditing] = useState(false);
  const [subs, setSubs] = useState(subreddits.join(", "));

  function togglePick(next: boolean) {
    update.mutate({ id: agent.id, config: { ...cfg, pick_subreddits: next } });
  }
  function startEdit() {
    setSubs(subreddits.join(", "));
    setEditing(true);
  }
  function save() {
    const next = subs
      .split(",")
      .map((s) => s.trim().replace(/^r\//i, ""))
      .filter(Boolean);
    update.mutate(
      { id: agent.id, config: { ...cfg, subreddits: next } },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4" /> Subreddits
          </CardTitle>
          {!editing && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={startEdit}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Let Sentrive pick</p>
            <p className="text-muted-foreground text-xs">
              It chooses the best-fitting subreddits for each post.
            </p>
          </div>
          <Switch checked={pick} onCheckedChange={togglePick} disabled={update.isPending} />
        </div>

        {editing ? (
          <>
            <div>
              <span className="text-muted-foreground mb-1 block text-xs font-medium">
                {pick ? "Preferred subreddits (optional)" : "Subreddits (comma separated)"}
              </span>
              <Input
                value={subs}
                onChange={(e) => setSubs(e.target.value)}
                placeholder="smallbusiness, SaaS, Entrepreneur"
                className="text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={update.isPending}>
                <Check className="size-4" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="size-4" /> Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            {subreddits.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {subreddits.map((s) => (
                  <span
                    key={s}
                    className="bg-muted inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium"
                  >
                    r/{s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                {pick
                  ? "No preferred subreddits set. It picks per post. Add your own to steer it."
                  : "No subreddits set yet. Add the ones it should post to."}
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              {pick ? "It picks per post, considering yours first." : "It posts only to these."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/** Editable schedule: pick a preset and it saves immediately. */
function ScheduleEditor({ agent }: { agent: Task }) {
  const update = useUpdateTaskSchedule();
  const current = agent.schedule_cron ?? "once";
  // If the agent's cron isn't one of the presets, keep it selectable.
  const options = SCHEDULES.some((s) => s.value === current)
    ? SCHEDULES
    : [{ value: current, label: scheduleLabel(agent.schedule_cron) }, ...SCHEDULES];

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">Schedule</span>
      <Select
        value={current}
        disabled={update.isPending}
        onValueChange={(v) =>
          update.mutate({ id: agent.id, scheduleCron: v === "once" ? null : v })
        }
      >
        <SelectTrigger size="sm" className="w-auto min-w-[11.5rem] font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Auto vs Ask for THIS agent. On a Reddit agent it's the "post for me" switch:
 * Auto queues and drips replies to Reddit on its own; Ask leaves them as drafts
 * to approve. The setting is per agent (falling back to the workspace default
 * when never set), so one agent can auto-post while others stay on Ask. We
 * confirm before turning Auto on since posts go out publicly as the user.
 */
function AutonomyEditor({ agent, isReddit }: { agent: Task; isReddit: boolean }) {
  const { data: ws } = useAutonomy();
  const update = useUpdateTaskAutonomy();
  const { confirm, dialog } = useConfirm();

  // This agent's own choice if it has one, else the workspace default.
  const override =
    agent.autonomy_mode === "auto" || agent.autonomy_mode === "ask" ? agent.autonomy_mode : null;
  const effective: "ask" | "auto" = override ?? ws?.mode ?? "ask";

  async function onChange(mode: "ask" | "auto") {
    if (mode === "auto" && effective !== "auto") {
      const ok = await confirm({
        title: "Turn on Auto for this agent?",
        description: isReddit
          ? "This agent will post its replies automatically from your connected Reddit account, spaced out and capped per day so your account stays safe. Only this agent is affected, and posts go out as you. You can switch back to Ask anytime."
          : "This agent will carry out its high-stakes actions (posting, sending) on its own, without waiting for your approval. Only this agent is affected. You can switch back to Ask anytime.",
        confirmLabel: "Turn on Auto",
      });
      if (!ok) return;
    }
    update.mutate({ id: agent.id, mode });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">{isReddit ? "Posting" : "Autonomy"}</span>
        <Select
          value={effective}
          disabled={update.isPending}
          onValueChange={(v) => onChange(v as "ask" | "auto")}
        >
          <SelectTrigger size="sm" className="w-auto min-w-[11.5rem] font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="ask">Ask first (you approve)</SelectItem>
            <SelectItem value="auto">Auto ({isReddit ? "post" : "act"} for me)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs">
        {effective === "auto"
          ? isReddit
            ? "This agent posts replies automatically, spaced out and capped per day."
            : "This agent runs its actions automatically, without waiting for approval."
          : "This agent drafts and waits for your approval. Applies to this agent only."}
      </p>
      {dialog}
    </div>
  );
}

/** Editable delivery: dashboard-only or email the result, saves immediately. */
function DeliveryEditor({ agent }: { agent: Task }) {
  const update = useUpdateTaskChannel();
  const current = agent.channel;
  // Legacy channel values (discord, slack, ...) stay selectable until changed.
  const options = CHANNELS.some((c) => c.value === current)
    ? [...CHANNELS]
    : [{ value: current, label: channelLabel(current) }, ...CHANNELS];

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">Delivers to</span>
      <Select
        value={current}
        disabled={update.isPending}
        onValueChange={(v) => update.mutate({ id: agent.id, channel: v })}
      >
        <SelectTrigger size="sm" className="w-auto min-w-[11.5rem] font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
