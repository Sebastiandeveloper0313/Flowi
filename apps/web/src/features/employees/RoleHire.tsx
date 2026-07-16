import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { CalendarClock, Check, Loader2 } from "lucide-react";

import { useRunTask } from "@/features/tasks/hooks";
import { createAgentFromProposal } from "@/features/tasks/mutations";
import { taskKeys } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";
import { templateToProposal } from "@/features/tasks/templates";
import { useWorkspace } from "@/features/workspace/hooks";
import { track } from "@/integrations/posthog";

import { starterTemplatesOf, type EmployeeMeta } from "./roles";

/**
 * The hiring moment, one shape for every role: who this employee is, the
 * skills they start with, one button. Hiring creates the starter skills;
 * the ones that need no connected account run immediately so real work shows
 * up within minutes, and the employee page surfaces connect prompts for the
 * rest (the first run starts by itself once connected).
 */
export function RoleHire({ meta }: { meta: EmployeeMeta }) {
  const { data: ws } = useWorkspace();
  const queryClient = useQueryClient();
  const run = useRunTask();
  const starters = starterTemplatesOf(meta);
  const company = ws?.name && ws.name !== "My team" ? ws.name : "your business";

  const hire = useMutation({
    mutationFn: async () => {
      const created = [];
      for (const t of starters) {
        created.push(await createAgentFromProposal(ws!.id, templateToProposal(t)));
      }
      return created;
    },
    onSuccess: (created) => {
      track("employee_hired", { role: meta.role, skills: created.length });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      for (const agent of created) {
        if (requiredToolkits(agent).length === 0) run.mutate(agent.id);
      }
    },
  });

  if (!ws || starters.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl border p-6 shadow-xs">
      <div className="flex items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl text-xl ${meta.tint}`}
        >
          {meta.emoji}
        </span>
        <div>
          <h2 className="text-lg font-semibold">
            {meta.name} is ready to start at {company}
          </h2>
          <p className="text-muted-foreground text-sm">
            {ws.business_context
              ? `Already briefed: ${meta.name.split(" ")[0]} read your website, so everything below starts tuned to your business.`
              : meta.hirePitch}{" "}
            You approve anything before it goes out.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2.5">
        {starters.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.id} className="bg-muted/30 flex items-start gap-3 rounded-xl border p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-muted-foreground text-sm">{t.tagline}</p>
                <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                  <CalendarClock className="size-3" /> {t.scheduleLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={hire.isPending} onClick={() => hire.mutate()}>
          {hire.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {hire.isPending ? "Hiring…" : `Hire ${meta.name}`}
        </Button>
        <p className="text-muted-foreground text-xs">
          Starts immediately. Teach more skills, or change anything, whenever you like.
        </p>
      </div>
      {hire.isError && (
        <p className="text-destructive mt-3 text-sm">
          Couldn't start everything: {(hire.error as Error)?.message || "unknown error"}. Try again.
        </p>
      )}
    </div>
  );
}
