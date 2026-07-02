import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/features/dashboard/ui";
import { formatWhen, useRuns, useTasks } from "@/features/tasks/hooks";
import { RunDot, runStatusLabel } from "@/features/tasks/ui";

export const Route = createFileRoute("/_authenticated/activity")({
  component: ActivityPage,
});

function ActivityPage() {
  const { data: runs, isLoading } = useRuns();
  const { data: tasks } = useTasks();
  const titleById = new Map((tasks ?? []).map((t) => [t.id, t.title]));

  return (
    <div className="flowy-page">
      <PageHeader
        title="Activity"
        subtitle="Every run across all your agents: what fired, what it did, and whether it landed."
      />

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading activity…
        </div>
      ) : !runs || runs.length === 0 ? (
        <div className="text-muted-foreground bg-card/60 rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
          No runs yet. Once your agents run, every result shows up here.
        </div>
      ) : (
        <div className="bg-card/95 overflow-hidden rounded-2xl border shadow-[0_24px_50px_-44px_rgba(16,48,120,0.4)]">
          {runs.map((run, i) => {
            const title = titleById.get(run.task_id) ?? "Agent";
            return (
              <div
                key={run.id}
                className={`hover:bg-muted/40 flex items-center gap-3.5 px-4 py-3.5 transition ${
                  i > 0 ? "border-t" : ""
                }`}
              >
                <RunDot status={run.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to="/agents/$agentId"
                      params={{ agentId: run.task_id }}
                      className="hover:text-primary truncate text-sm font-medium"
                    >
                      {title}
                    </Link>
                    {run.status === "failed" && (
                      <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[0.65rem] font-semibold text-rose-600">
                        failed
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground truncate text-sm">
                    {run.summary ?? run.error ?? runStatusLabel(run.status)}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatWhen(run.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
