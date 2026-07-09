import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { CalendarClock, Check, Loader2, Plug } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/features/dashboard/ui";
import { toolkitName } from "@/features/integrations/ConnectCta";
import { AgentCreatedJourney } from "@/features/tasks/AgentCreatedJourney";
import { useTasks } from "@/features/tasks/hooks";
import { createAgentFromProposal } from "@/features/tasks/mutations";
import { requiredToolkits } from "@/features/tasks/requirements";
import {
  AGENT_TEMPLATES,
  type AgentTemplate,
  TEMPLATE_CATEGORIES,
  templateToProposal,
} from "@/features/tasks/templates";
import { useWorkspace } from "@/features/workspace/hooks";
import { track } from "@/integrations/posthog";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

function LibraryPage() {
  const { data: ws } = useWorkspace();
  const { data: tasks } = useTasks();

  // Which templates the workspace already has an agent for, keyed by the
  // template id we stamp into config.proposal_id at creation. Lets a card show
  // "Added" (and link to the agent) instead of silently spawning duplicates.
  const existingByTemplate = new Map<string, string>();
  for (const t of tasks ?? []) {
    const pid = (t.config as { proposal_id?: string } | null)?.proposal_id;
    if (pid) existingByTemplate.set(pid, t.id);
  }

  const teamId = ws?.id ?? null;
  const company = ws?.name && ws.name !== "My team" ? ws.name : "your business";

  return (
    <div className="flowy-page">
      <PageHeader
        title="Agent Library"
        subtitle={`Ready-made marketing agents for ${company}. Add any with one click, you approve everything before it ships.`}
      />

      <div className="flex flex-col gap-10">
        {TEMPLATE_CATEGORIES.map((category) => {
          const items = AGENT_TEMPLATES.filter((t) => t.category === category);
          if (items.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                {category}
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    teamId={teamId}
                    existingAgentId={existingByTemplate.get(t.id) ?? null}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TemplateCard({
  template: t,
  teamId,
  existingAgentId,
}: {
  template: AgentTemplate;
  teamId: string | null;
  existingAgentId: string | null;
}) {
  const [createdId, setCreatedId] = useState<string | null>(null);
  const Icon = t.icon;
  const needs = requiredToolkits({ kind: t.kind });

  const create = useMutation({
    mutationFn: () => {
      if (!teamId) throw new Error("No workspace selected.");
      return createAgentFromProposal(teamId, templateToProposal(t));
    },
    onSuccess: (agent) => {
      setCreatedId(agent.id);
      track("template_added", { template: t.id, kind: t.kind });
    },
  });

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white">
            <Icon className="size-4.5" />
          </span>
          <span className="font-semibold">{t.name}</span>
        </div>

        <p className="text-foreground/90 text-sm">{t.tagline}</p>
        <p className="text-muted-foreground flex-1 text-sm">{t.description}</p>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" /> {t.scheduleLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-3.5" /> {t.outcome}
          </span>
          {needs.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Plug className="size-3.5" /> Needs {needs.map(toolkitName).join(" + ")}
            </span>
          )}
        </div>

        <div className="pt-1">
          {createdId ? (
            <AgentCreatedJourney agentId={createdId} kind={t.kind} />
          ) : existingAgentId ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <Check className="size-3.5" /> Added
              </span>
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                <Link to="/agents/$agentId" params={{ agentId: existingAgentId }}>
                  View agent
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <Button
                size="sm"
                disabled={create.isPending || !teamId}
                onClick={() => create.mutate()}
              >
                {create.isPending && <Loader2 className="size-4 animate-spin" />}
                Add to my agents
              </Button>
              {create.isError && (
                <p className="text-destructive mt-1.5 text-xs">
                  {(create.error as Error)?.message || "Couldn't add the agent. Try again."}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
