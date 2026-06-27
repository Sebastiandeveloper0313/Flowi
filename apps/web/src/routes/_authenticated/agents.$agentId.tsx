import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
  Hash,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { useState } from "react";

import {
  channelLabel,
  formatWhen,
  scheduleLabel,
  useDeleteTask,
  useRunTask,
  useSetTaskStatus,
  useTaskRuns,
  useTasks,
} from "@/features/tasks/hooks";
import type { TaskRun } from "@/features/tasks/queries";
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

  const agent = tasks?.find((t) => t.id === agentId);

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
          <Button size="sm" disabled={running} onClick={() => run.mutate(agent.id)}>
            {running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {running ? "Running…" : "Run now"}
          </Button>
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
            onClick={() => {
              if (confirm(`Delete “${agent.title}”? This can't be undone.`)) {
                remove.mutate(agent.id, { onSuccess: () => navigate({ to: "/agents" }) });
              }
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      {run.isError && (
        <p className="text-destructive mb-4 text-sm">
          {(run.error as Error).message || "Run failed."}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* left: instruction + run history */}
        <div className="space-y-5">
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
                runs.map((r, i) => <RunRow key={r.id} run={r} defaultOpen={i === 0} />)
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
              <Row label="Schedule" value={scheduleLabel(agent.schedule_cron)} />
              <Row label="Next run" value={formatWhen(agent.next_run_at)} />
              <Row label="Last run" value={formatWhen(agent.last_run_at)} />
              <Separator />
              <Row label="Delivers to" value={channelLabel(agent.channel)} />
            </CardContent>
          </Card>

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

          <Button variant="outline" className="w-full" asChild>
            <Link to="/dashboard" search={{ c: undefined }}>
              <MessageSquare className="size-4" /> Open chat
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function RunRow({ run, defaultOpen }: { run: TaskRun; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const body = run.output ?? run.error ?? run.summary ?? "No output.";
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
        <pre className="text-muted-foreground max-h-72 overflow-auto border-t px-3.5 py-3 text-xs whitespace-pre-wrap">
          {body}
        </pre>
      )}
    </div>
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
