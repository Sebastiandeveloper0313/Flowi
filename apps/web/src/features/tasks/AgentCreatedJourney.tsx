import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import { ConnectButton, toolkitName } from "@/features/integrations/ConnectCta";
import { useMissingToolkits } from "@/features/integrations/hooks";

import { useRunTask } from "./hooks";
import { requiredToolkits } from "./requirements";

/**
 * After an agent is created, this turns the spot it was created from into a
 * guide: connect the integration the agent needs (one click, polls until the
 * OAuth tab finishes), kick off the first run by itself, then jump to the
 * results. Shared by the dashboard suggestions and the Library so the "no dead
 * ends" flow stays identical everywhere. Only ever mount this for an agent
 * created in the current session, since it auto-runs once on mount.
 */
export function AgentCreatedJourney({ agentId, kind }: { agentId: string; kind: string }) {
  const needs = requiredToolkits({ kind });
  const { missing, loaded } = useMissingToolkits(needs);
  const run = useRunTask();
  const started = useRef(false);

  // The first run starts itself the moment the agent can actually succeed:
  // right away when nothing needs connecting, or as soon as the connection
  // lands. Creating the agent was the deliberate act; no second ask.
  const readyToRun = loaded && missing.length === 0;
  useEffect(() => {
    if (!readyToRun || started.current) return;
    started.current = true;
    run.mutate(agentId);
  }, [readyToRun, agentId, run]);

  const viewAgentLink = (
    <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
      <Link to="/agents/$agentId" params={{ agentId }}>
        View agent
      </Link>
    </Button>
  );

  if (!loaded) {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Loader2 className="size-3.5 animate-spin" /> Agent created…
      </p>
    );
  }

  if (missing.length > 0) {
    const names = missing.map(toolkitName).join(" and ");
    return (
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <Check className="size-3.5" /> Agent created
        </p>
        <p className="text-muted-foreground text-xs">
          One step left: connect {names} and the first run starts by itself.
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {missing.map((slug) => (
            <ConnectButton key={slug} toolkit={slug} />
          ))}
          {viewAgentLink}
        </div>
      </div>
    );
  }

  if (run.isSuccess) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <Check className="size-3.5" /> First run done
        </p>
        <Button size="sm" asChild>
          <Link to="/agents/$agentId" params={{ agentId }}>
            See what it produced <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    );
  }

  if (run.isError) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-destructive text-xs">
          {(run.error as Error)?.message || "The first run failed."}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" disabled={run.isPending} onClick={() => run.mutate(agentId)}>
            <Sparkles className="size-3.5" /> Run again
          </Button>
          {viewAgentLink}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <Check className="size-3.5" /> Agent created
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" disabled>
          <Loader2 className="size-3.5 animate-spin" /> Running first time…
        </Button>
        {viewAgentLink}
      </div>
    </div>
  );
}
