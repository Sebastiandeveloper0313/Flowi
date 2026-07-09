import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { CalendarClock, Check, ChevronDown, Loader2, Plug } from "lucide-react";
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

      <div className="flex flex-col gap-8">
        {TEMPLATE_CATEGORIES.map((category) => {
          const items = AGENT_TEMPLATES.filter((t) => t.category === category);
          if (items.length === 0) return null;
          return (
            <CategorySection
              key={category}
              category={category}
              items={items}
              teamId={teamId}
              existingByTemplate={existingByTemplate}
            />
          );
        })}
      </div>
    </div>
  );
}

// How many templates a category shows before a "See all" toggle. One full row
// at the three-up layout, so the page stays compact no matter how many agents a
// category holds; the rest are one click away.
const INITIAL_PER_CATEGORY = 3;

function CategorySection({
  category,
  items,
  teamId,
  existingByTemplate,
}: {
  category: string;
  items: AgentTemplate[];
  teamId: string | null;
  existingByTemplate: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, INITIAL_PER_CATEGORY);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {category}
        </h2>
        {items.length > INITIAL_PER_CATEGORY && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-primary hover:bg-primary/5 -mr-1 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium transition-colors"
          >
            {expanded ? "Show less" : `See all ${items.length}`}
            <ChevronDown
              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
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
    <Card className="hover:border-primary/40 flex flex-col shadow-[0_24px_50px_-46px_rgba(16,48,120,0.45)] transition-colors">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white shadow-sm shadow-[#1566e6]/25">
            <Icon className="size-5" />
          </span>
          <h3 className="font-semibold">{t.name}</h3>
        </div>

        <p className="text-foreground/90 text-sm">{t.tagline}</p>
        <p className="text-muted-foreground text-sm">{t.description}</p>

        <div className="text-muted-foreground mt-auto flex flex-col gap-1.5 border-t pt-3 text-xs">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5 shrink-0" /> {t.scheduleLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-3.5 shrink-0" /> {t.outcome}
          </span>
          {needs.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Plug className="size-3.5 shrink-0" /> Needs {needs.map(toolkitName).join(" + ")}
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
                className="w-full"
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
