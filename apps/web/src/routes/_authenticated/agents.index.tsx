import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Bot,
  CalendarClock,
  ChevronRight,
  Clock,
  Hash,
  Loader2,
  MessageSquarePlus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

import { useConfirm } from "@/components/useConfirm";
import { PageHeader } from "@/features/dashboard/ui";
import {
  channelLabel,
  formatWhen,
  scheduleLabel,
  useBulkDeleteTasks,
  useTasks,
} from "@/features/tasks/hooks";
import type { Task } from "@/features/tasks/queries";
import { TaskStatusBadge } from "@/features/tasks/ui";

export const Route = createFileRoute("/_authenticated/agents/")({
  component: AgentsPage,
});

function AgentRow({
  agent,
  selected,
  onToggle,
}: {
  agent: Task;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className={`group bg-card/95 flex items-start gap-3 rounded-2xl border p-4 shadow-[0_24px_50px_-44px_rgba(16,48,120,0.4)] transition ${
        selected ? "border-primary/50 ring-primary/20 ring-1" : "hover:border-primary/40"
      }`}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggle(agent.id)}
        aria-label={`Select ${agent.title}`}
        className="mt-1 shrink-0"
      />
      <Link to="/agents/$agentId" params={{ agentId: agent.id }} className="min-w-0 flex-1">
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
      </Link>
      <ChevronRight className="text-muted-foreground/50 group-hover:text-primary mt-1 size-5 shrink-0 transition" />
    </div>
  );
}

function AgentsPage() {
  const { data: tasks, isLoading } = useTasks();
  const bulkDelete = useBulkDeleteTasks();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState<"active" | "paused">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const all = tasks ?? [];
  const counts = {
    active: all.filter((t) => t.status === "active").length,
    paused: all.filter((t) => t.status !== "active").length,
  };
  const shown = all.filter((t) =>
    filter === "active" ? t.status === "active" : t.status !== "active",
  );
  const shownSelectedCount = shown.filter((t) => selected.has(t.id)).length;
  const allShownSelected = shown.length > 0 && shownSelectedCount === shown.length;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function switchTab(f: "active" | "paused") {
    setFilter(f);
    setSelected(new Set());
  }

  function toggleAll() {
    setSelected((s) => {
      const n = new Set(s);
      if (allShownSelected) shown.forEach((t) => n.delete(t.id));
      else shown.forEach((t) => n.add(t.id));
      return n;
    });
  }

  async function onBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: ids.length > 1 ? `Delete ${ids.length} agents?` : "Delete agent?",
      description: "They'll be permanently deleted along with their runs. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    bulkDelete.mutate(ids, { onSuccess: () => setSelected(new Set()) });
  }

  const TABS: { key: "active" | "paused"; label: string; n: number }[] = [
    { key: "active", label: "Active", n: counts.active },
    { key: "paused", label: "Paused", n: counts.paused },
  ];

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
      ) : all.length === 0 ? (
        <div className="text-muted-foreground bg-card/60 rounded-2xl border border-dashed px-6 py-16 text-center">
          <Bot className="mx-auto mb-3 size-7 opacity-60" />
          <p className="text-foreground font-medium">No agents yet</p>
          <p className="mt-1 text-sm">
            Describe a recurring job in the chat and Senable sets it up for you.
          </p>
          <Button asChild className="mt-5">
            <Link to="/dashboard" search={{ c: undefined }}>
              <MessageSquarePlus className="size-4" /> Start in chat
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => switchTab(t.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  filter === t.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.label}
                {t.n > 0 && <span className="ml-1.5 opacity-70">{t.n}</span>}
              </button>
            ))}
            <div className="grow" />
            {shown.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-muted-foreground hover:text-foreground text-xs font-medium"
              >
                {allShownSelected ? "Clear selection" : "Select all"}
              </button>
            )}
          </div>

          {selected.size > 0 && (
            <div className="border-primary/20 bg-primary/5 mb-3 flex items-center gap-3 rounded-xl border px-4 py-2.5">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <div className="grow" />
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkDelete.isPending}
                onClick={onBulkDelete}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setSelected(new Set())}
              >
                <X className="size-4" /> Clear
              </Button>
            </div>
          )}

          {shown.length === 0 ? (
            <div className="text-muted-foreground bg-card/60 rounded-2xl border border-dashed px-6 py-12 text-center text-sm">
              {filter === "active" ? "No active agents." : "No paused agents."}
            </div>
          ) : (
            <div className="grid gap-3">
              {shown.map((t) => (
                <AgentRow key={t.id} agent={t} selected={selected.has(t.id)} onToggle={toggle} />
              ))}
            </div>
          )}
        </>
      )}
      {dialog}
    </div>
  );
}
