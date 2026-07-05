import { Button } from "@workspace/ui/components/button";
import { Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { scheduleLabel, useRunTask } from "./hooks";
import type { Task } from "./queries";

/**
 * Visibility for the first-visit agent guide, lifted so the page can hand the
 * run action to the guide while it's on screen (one run button at a time).
 * Dismissed state is remembered per agent kind, so each type of agent
 * explains itself exactly once.
 */
export function useAgentGuide(agent: Task | undefined) {
  const kind = agent?.kind === "reddit_monitor" ? "reddit_monitor" : "content";
  const seenKey = `sentrive.agent-guide.${kind}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (agent) setVisible(!localStorage.getItem(seenKey));
  }, [agent, seenKey]);

  function dismiss() {
    localStorage.setItem(seenKey, "1");
    setVisible(false);
  }

  return { visible, dismiss };
}

/**
 * First-visit explainer on the agent page: three beats on how this agent
 * works, tailored to its kind, ending in the first run. While visible it is
 * the page's run control; the header button returns once it's dismissed.
 */
export function AgentGuide({
  agent,
  visible,
  onDismiss,
}: {
  agent: Task;
  visible: boolean;
  onDismiss: () => void;
}) {
  const run = useRunTask();

  if (!visible) return null;

  const label = scheduleLabel(agent.schedule_cron);
  const schedule = label.charAt(0).toLowerCase() + label.slice(1);
  const steps =
    agent.kind === "reddit_monitor"
      ? [
          {
            title: `Runs ${schedule}`,
            text: "It searches Reddit for the phrases under Watching. Edit them anytime.",
          },
          {
            title: "Drafts land in Leads",
            text: "Every prospect it finds gets a ready-to-post reply, written for your business.",
          },
          {
            title: "You approve, it posts",
            text: "Approve a reply and it goes out from your Reddit account. Nothing posts on its own.",
          },
        ]
      : [
          {
            title: `Runs ${schedule}`,
            text: "It does the job in the instruction below and writes up the result.",
          },
          {
            title: "Results show in Run history",
            text:
              agent.channel === "email"
                ? "Every run's output appears below and lands in your inbox."
                : "Every run's output appears below, ready to use.",
          },
          {
            title: "Tune it anytime",
            text: "Change the schedule or delivery in Settings, or just tell the chat what to adjust.",
          },
        ];

  return (
    <div className="bg-card relative mb-5 overflow-hidden rounded-2xl border p-5 shadow-xs">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#5aa6ff]/10 to-transparent" />
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground absolute top-3 right-3"
        onClick={onDismiss}
        aria-label="Dismiss guide"
      >
        <X className="size-4" />
      </Button>

      <p className="relative text-sm font-semibold">How this agent works</p>
      <div className="relative mt-4 grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="flex items-start gap-2.5">
            <span className="bg-primary/10 text-primary grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-4 flex items-center gap-2">
        <Button
          size="sm"
          disabled={run.isPending}
          onClick={() => run.mutate(agent.id, { onSettled: onDismiss })}
        >
          {run.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {run.isPending ? "Running…" : "Run it now"}
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}
