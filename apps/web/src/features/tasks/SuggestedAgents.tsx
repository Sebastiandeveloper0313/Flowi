import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  ArrowRight,
  Brain,
  Briefcase,
  CalendarClock,
  FileText,
  Loader2,
  MessageSquarePlus,
  PenLine,
  Radar,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { useWorkspace } from "@/features/workspace/hooks";
import { track } from "@/integrations/posthog";

import { AgentCreatedJourney } from "./AgentCreatedJourney";
import { scheduleLabel, useTasks } from "./hooks";
import { createAgentFromProposal } from "./mutations";
import { taskKeys } from "./queries";
import { fetchAgentSuggestions, type AgentSuggestion } from "./suggestions";

/**
 * Personalized starter agents shown while the team has none, so a fresh
 * dashboard proposes real work instead of a blank chat. Once the user creates
 * one, the card walks them through the rest: connect the channel it needs,
 * run the first scan, see the results.
 */
export function SuggestedAgents() {
  const { data: ws } = useWorkspace();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const queryClient = useQueryClient();
  // Keep the section on screen after the first create, so the guided steps
  // (connect, first run) don't vanish the moment an agent exists.
  const [journeyStarted, setJourneyStarted] = useState(false);

  const teamId = ws?.id;
  const enabled =
    Boolean(teamId && ws?.business_context) &&
    !tasksLoading &&
    (tasks?.length === 0 || journeyStarted);

  const {
    data: suggestions,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["agent-suggestions", teamId],
    queryFn: () => fetchAgentSuggestions(teamId!),
    enabled,
    staleTime: Infinity,
    retry: 1,
  });

  // First run, but we never got any business context (e.g. the website analysis
  // failed during onboarding). Suggestions can't be tailored, so instead of a
  // blank dashboard, point the user at Settings to add their details.
  const firstRunNoContext =
    Boolean(teamId) && !tasksLoading && tasks?.length === 0 && !ws?.business_context;

  if (!enabled || isError) {
    if (firstRunNoContext) return <BusinessContextPrompt />;
    return null;
  }

  const company = ws?.name && ws.name !== "My team" ? ws.name : "your business";

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-4 text-[#3d82f5]" />
            Ready to run for {company}
          </h2>
          <p className="text-muted-foreground text-sm">
            Based on your website. One click each, and you approve everything before it ships.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={isLoading || isRefetching}
          onClick={() => {
            void fetchAgentSuggestions(teamId!, { refresh: true }).then(() => refetch());
          }}
        >
          <RefreshCw className={`size-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          Different ideas
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground bg-card/60 flex items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Designing agents for {company}…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {(suggestions ?? []).map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              teamId={teamId!}
              onCreated={() => {
                setJourneyStarted(true);
                void queryClient.invalidateQueries({ queryKey: taskKeys.all });
              }}
            />
          ))}
        </div>
      )}

      {!isLoading && (
        <button
          type="button"
          onClick={() => {
            track("suggestions_describe_own");
            window.dispatchEvent(new CustomEvent("sentrive:focus-composer"));
          }}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/40 mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed py-3 text-sm transition-colors"
        >
          <MessageSquarePlus className="size-4" /> Want something else? Describe your own in the
          chat
        </button>
      )}
    </section>
  );
}

/** Shown on a first-run dashboard when we have no business context to tailor from. */
function BusinessContextPrompt() {
  return (
    <section className="mb-10">
      <div className="bg-card/60 rounded-2xl border border-dashed px-6 py-10 text-center">
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-[#eef4fd] text-[#1566e6]">
          <Brain className="size-5" />
        </div>
        <h2 className="text-lg font-semibold">Tell Sentrive about your business first</h2>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
          We couldn't read your website during setup, so there's nothing to build agents from yet.
          Add your details and Sentrive will suggest agents made for you.
        </p>
        <Button asChild className="mt-4">
          <Link to="/settings">
            Add your business details <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function SuggestionCard({
  suggestion: s,
  teamId,
  onCreated,
}: {
  suggestion: AgentSuggestion;
  teamId: string;
  onCreated: () => void;
}) {
  const [createdId, setCreatedId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createAgentFromProposal(teamId, {
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
    onSuccess: (agent) => {
      setCreatedId(agent.id);
      track("suggested_agent_created", { kind: s.kind, title: s.title });
      onCreated();
    },
  });

  const Icon =
    s.kind === "reddit_monitor"
      ? Radar
      : s.kind === "linkedin_post"
        ? Briefcase
        : s.kind === "seo_blog"
          ? FileText
          : PenLine;

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white">
            <Icon className="size-4" />
          </span>
          <span className="font-semibold">{s.title}</span>
        </div>
        <p className="text-muted-foreground flex-1 text-sm">{s.pitch}</p>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <CalendarClock className="size-3.5" />
          {scheduleLabel(s.schedule_cron)}
        </p>
        {create.isError && (
          <p className="text-destructive text-xs">
            {(create.error as Error)?.message || "Couldn't create the agent. Try again."}
          </p>
        )}
        {createdId ? (
          <AgentCreatedJourney agentId={createdId} kind={s.kind} />
        ) : (
          <Button size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create agent
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
