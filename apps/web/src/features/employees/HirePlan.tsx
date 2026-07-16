import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  Check,
  FileText,
  Loader2,
  PenLine,
  Radar,
  Sparkles,
} from "lucide-react";

import { scheduleLabel, useRunTask } from "@/features/tasks/hooks";
import { createAgentFromProposal } from "@/features/tasks/mutations";
import { taskKeys } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";
import { fetchAgentSuggestions, type AgentSuggestion } from "@/features/tasks/suggestions";
import { useWorkspace } from "@/features/workspace/hooks";
import { track } from "@/integrations/posthog";

function kindIcon(kind: AgentSuggestion["kind"]) {
  if (kind === "reddit_monitor" || kind === "reddit_post") return Radar;
  if (kind === "linkedin_post") return Briefcase;
  if (kind === "seo_blog") return FileText;
  return PenLine;
}

/**
 * The hiring moment. Shown on the desk while the workspace has no agents yet:
 * Sentrive presents the work plan it drew up from the user's website, and one
 * click puts it on the job (creates every proposed agent, immediately runs the
 * ones that need no connected account so the feed shows real work within
 * minutes; the rest surface a connect prompt on the desk).
 */
export function HirePlan() {
  const { data: ws } = useWorkspace();
  const queryClient = useQueryClient();
  const run = useRunTask();
  const teamId = ws?.id;
  const company = ws?.name && ws.name !== "My team" ? ws.name : "your business";

  const {
    data: suggestions,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["agent-suggestions", teamId],
    queryFn: () => fetchAgentSuggestions(teamId!),
    enabled: Boolean(teamId && ws?.business_context),
    staleTime: Infinity,
    retry: 1,
  });

  const hire = useMutation({
    mutationFn: async () => {
      const created = [];
      for (const s of suggestions ?? []) {
        created.push(
          await createAgentFromProposal(teamId!, {
            title: s.title,
            instructions: s.instructions,
            channel: s.channel,
            schedule_cron: s.schedule_cron,
            timezone: s.timezone,
            kind: s.kind,
            keywords: s.keywords,
            subreddits: s.subreddits,
            proposalId: s.id,
          }),
        );
      }
      return created;
    },
    onSuccess: (created) => {
      track("desk_plan_hired", { count: created.length });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      // Skills that need no connected account can start right now, so the desk
      // has real results on it by the time the user finishes connecting Reddit.
      for (const agent of created) {
        if (requiredToolkits(agent).length === 0) run.mutate(agent.id);
      }
    },
  });

  if (!ws) return null;

  // No business context (website analysis failed): can't draft a plan.
  if (!ws.business_context) {
    return (
      <div className="bg-card/60 rounded-2xl border border-dashed px-6 py-10 text-center">
        <h2 className="text-lg font-semibold">First, tell Sentrive about your business</h2>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
          We couldn't read your website during setup, so there's no plan to propose yet. Add your
          details and Sentrive will draw one up.
        </p>
        <Button asChild className="mt-4">
          <Link to="/settings">
            Add business details <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    );
  }

  if (isLoading || (!suggestions && !isError)) {
    return (
      <div className="bg-card/60 flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
        <Loader2 className="text-primary size-5 animate-spin" />
        <p className="font-medium">Sentrive is drafting its work plan for {company}…</p>
        <p className="text-muted-foreground text-sm">
          It read your website and is deciding where your customers are and what to do first.
        </p>
      </div>
    );
  }

  if (isError || !suggestions || suggestions.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl border p-6 shadow-xs">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef4fd] text-[#1566e6]">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Here's my plan for {company}</h2>
          <p className="text-muted-foreground text-sm">
            Based on your website. I'll run this on schedule and you approve anything before it goes
            out.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2.5">
        {suggestions.map((s) => {
          const Icon = kindIcon(s.kind);
          return (
            <div key={s.id} className="bg-muted/30 flex items-start gap-3 rounded-xl border p-3.5">
              <span className="text-muted-foreground mt-0.5 shrink-0">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-muted-foreground text-sm">{s.pitch}</p>
                <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                  <CalendarClock className="size-3" /> {scheduleLabel(s.schedule_cron)}
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
          {hire.isPending ? "Starting…" : "Put Sentrive to work"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Starts immediately. Change or stop any of it whenever you like.
        </p>
      </div>
      {hire.isError && (
        <p className="text-destructive mt-3 text-sm">
          Couldn't start everything. Try again, or ask in chat.
        </p>
      )}
    </div>
  );
}
