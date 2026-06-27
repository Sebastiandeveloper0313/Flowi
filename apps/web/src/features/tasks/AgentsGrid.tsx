import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import {
  Bot,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Hash,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import {
  channelLabel,
  scheduleLabel,
  useDeleteTask,
  useRuns,
  useRunTask,
  useSetTaskStatus,
  useTasks,
} from "./hooks";
import type { Task, TaskRun } from "./queries";

export function AgentsGrid() {
  const { data: tasks, isLoading } = useTasks();
  const { data: runs } = useRuns();

  const latestByTask = new Map<string, TaskRun>();
  for (const r of runs ?? []) {
    if (!latestByTask.has(r.task_id)) latestByTask.set(r.task_id, r);
  }

  return (
    <section>
      <header className="mb-5 flex items-end justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Your agents</h2>
        <Button variant="outline" size="sm" asChild>
          <Link to="/agents">Manage all</Link>
        </Button>
      </header>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading your agents…
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <div className="text-muted-foreground bg-card/60 rounded-2xl border border-dashed px-6 py-12 text-center">
          <Bot className="mx-auto mb-2 size-6 opacity-60" />
          <p className="text-sm">
            No agents yet — describe a recurring job in the chat above to create one.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} latestRun={latestByTask.get(task.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function TaskCard({ task, latestRun }: { task: Task; latestRun?: TaskRun }) {
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();
  const run = useRunTask();
  const [showOutput, setShowOutput] = useState(false);
  const paused = task.status === "paused";
  const running = run.isPending || latestRun?.status === "running";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-snug">{task.title}</CardTitle>
          <Badge variant={paused ? "secondary" : "default"}>{paused ? "Paused" : "Active"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground line-clamp-3 text-sm">{task.instructions}</p>

        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" /> {scheduleLabel(task.schedule_cron)}
          </span>
          <span className="flex items-center gap-1.5">
            <Hash className="size-3.5" /> {channelLabel(task.channel)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" disabled={running} onClick={() => run.mutate(task.id)}>
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {running ? "Running…" : "Run now"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: task.id, status: paused ? "active" : "paused" })}
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (confirm(`Delete “${task.title}”? This can't be undone.`)) remove.mutate(task.id);
            }}
          >
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>

        {run.isError && (
          <p className="text-destructive text-xs">
            {(run.error as Error).message || "Run failed."}
          </p>
        )}

        {latestRun && (
          <div className="bg-muted/50 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={`size-2 rounded-full ${
                    latestRun.status === "succeeded"
                      ? "bg-green-500"
                      : latestRun.status === "failed"
                        ? "bg-destructive"
                        : "bg-amber-500"
                  }`}
                />
                Latest result
              </span>
              {latestRun.output && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowOutput((v) => !v)}
                >
                  {showOutput ? (
                    <ChevronUp className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                  {showOutput ? "Hide" : "View"}
                </Button>
              )}
            </div>
            <p className="text-muted-foreground mt-1.5 text-sm">
              {latestRun.error ?? latestRun.summary ?? "No summary."}
            </p>
            {showOutput && latestRun.output && (
              <pre className="text-muted-foreground mt-2 max-h-60 overflow-auto border-t pt-2 text-xs whitespace-pre-wrap">
                {latestRun.output}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
