import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronUp, Copy, Loader2, MessageSquare } from "lucide-react";
import { useState } from "react";

import { chatKeys, createChat, saveMessage } from "@/features/chat/hooks";
import { ChatMarkdown } from "@/features/chat/Markdown";
import { PageHeader } from "@/features/dashboard/ui";
import { formatWhen, useRuns, useTasks } from "@/features/tasks/hooks";
import type { TaskRun } from "@/features/tasks/queries";
import { humanizeRunError, RunDot, runSummaryLine } from "@/features/tasks/ui";
import { useActiveTeamId } from "@/features/workspace/active";

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
        subtitle="A log of every result your agents produced. Open one to read it, copy it, or continue it in chat."
      />

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading activity…
        </div>
      ) : !runs || runs.length === 0 ? (
        <div className="text-muted-foreground bg-card/60 flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
          <p>
            {tasks && tasks.length > 0
              ? "No runs yet. Once your agents run, every result shows up here."
              : "No runs yet. Create an agent and its results will show up here."}
          </p>
          {(!tasks || tasks.length === 0) && (
            <Link
              to="/dashboard"
              search={{ c: undefined }}
              className="text-primary font-medium hover:underline"
            >
              Create your first agent →
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-card/95 overflow-hidden rounded-2xl border shadow-[0_24px_50px_-44px_rgba(16,48,120,0.4)]">
          {runs.map((run, i) => (
            <ActivityRow
              key={run.id}
              run={run}
              title={titleById.get(run.task_id) ?? "Agent"}
              bordered={i > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One run, expandable to read the full output (or error) it produced. */
function ActivityRow({ run, title, bordered }: { run: TaskRun; title: string; bordered: boolean }) {
  const [open, setOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const teamId = useActiveTeamId();
  const body = run.output ?? run.error ?? null;

  // Open a fresh chat seeded with this result (as an assistant message) so the
  // user can pick it up and keep going, the reply the one-way log can't offer.
  async function continueInChat() {
    const output = run.output;
    if (!teamId || !output || seeding) return;
    setSeeding(true);
    try {
      const id = await createChat(teamId, `Continue: ${title}`);
      await saveMessage(id, teamId, { role: "assistant", content: output });
      await queryClient.invalidateQueries({ queryKey: chatKeys.list });
      await navigate({ to: "/dashboard", search: { c: id } });
    } catch {
      setSeeding(false);
    }
  }

  async function copyOutput() {
    const output = run.output;
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (non-secure context); nothing to do
    }
  }

  return (
    <div className={bordered ? "border-t" : ""}>
      <div className="hover:bg-muted/40 flex items-center gap-3.5 px-4 py-3.5 transition">
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
          <p className="text-muted-foreground truncate text-sm">{runSummaryLine(run)}</p>
        </div>
        <span className="text-muted-foreground shrink-0 text-xs">{formatWhen(run.created_at)}</span>
        {body && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        )}
      </div>
      {open && body && (
        <div className="border-t px-4 py-3.5">
          <div className="text-foreground/80 max-h-96 overflow-auto">
            {run.output ? (
              <ChatMarkdown>{run.output}</ChatMarkdown>
            ) : (
              <p className="text-destructive text-sm whitespace-pre-wrap">
                {humanizeRunError(run.error)}
              </p>
            )}
          </div>
          {run.output && (
            <div className="mt-3 flex items-center gap-4 border-t pt-3">
              <button
                type="button"
                onClick={copyOutput}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={continueInChat}
                disabled={seeding}
                className="text-primary inline-flex items-center gap-1.5 text-xs font-medium hover:underline disabled:opacity-60"
              >
                {seeding ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <MessageSquare className="size-3.5" />
                )}
                {seeding ? "Opening…" : "Continue in chat"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
