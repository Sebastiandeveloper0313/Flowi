import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
  Bot,
  CalendarClock,
  ChevronRight,
  Clock,
  Hash,
  Loader2,
  MessageSquarePlus,
} from "lucide-react";

import { PageHeader } from "@/features/dashboard/ui";
import { channelLabel, formatWhen, scheduleLabel, useTasks } from "@/features/tasks/hooks";
import type { Task } from "@/features/tasks/queries";
import { TaskStatusBadge } from "@/features/tasks/ui";

export const Route = createFileRoute("/_authenticated/agents/")({
  component: AgentsPage,
});

function AgentRow({ agent }: { agent: Task }) {
  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: agent.id }}
      className="group bg-card/95 hover:border-primary/40 block rounded-2xl border p-4 shadow-[0_24px_50px_-44px_rgba(16,48,120,0.4)] transition hover:shadow-[0_28px_60px_-40px_rgba(16,48,120,0.5)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="truncate font-semibold">{agent.title}</h3>
            <TaskStatusBadge status={agent.status} />
          </div>
          <p className="text-muted-foreground mt-1.5 line-clamp-1 text-sm">{agent.instructions}</p>
          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" /> {scheduleLabel(agent.schedule_cron)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" /> Next: {formatWhen(agent.next_run_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <Hash className="size-3.5" /> {channelLabel(agent.channel)}
            </span>
          </div>
        </div>
        <ChevronRight className="text-muted-foreground/50 group-hover:text-primary mt-1 size-5 shrink-0 transition" />
      </div>
    </Link>
  );
}

function AgentsPage() {
  const { data: tasks, isLoading } = useTasks();

  return (
    <div className="flowy-page">
      <PageHeader
        title="Agents"
        subtitle="Every recurring agent you've set up. This is where your work runs."
        actions={
          <Button asChild>
            <Link to="/dashboard" search={{ c: undefined }}>
              <MessageSquarePlus className="size-4" /> New agent
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading your agents…
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <div className="text-muted-foreground bg-card/60 rounded-2xl border border-dashed px-6 py-16 text-center">
          <Bot className="mx-auto mb-3 size-7 opacity-60" />
          <p className="text-foreground font-medium">No agents yet</p>
          <p className="mt-1 text-sm">
            Describe a recurring job in the chat and Flowy sets it up for you.
          </p>
          <Button asChild className="mt-5">
            <Link to="/dashboard" search={{ c: undefined }}>
              <MessageSquarePlus className="size-4" /> Start in chat
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {tasks.map((t) => (
            <AgentRow key={t.id} agent={t} />
          ))}
        </div>
      )}
    </div>
  );
}
