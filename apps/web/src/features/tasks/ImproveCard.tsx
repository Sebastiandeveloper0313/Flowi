import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Check, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";

import { useActiveTeamId } from "@/features/workspace/active";
import { supabase } from "@/integrations/supabase/client";
import { readFunctionError } from "@/integrations/supabase/functions";

import { scheduleLabel } from "./hooks";
import { updateAgentFields, type AgentUpdateChanges } from "./mutations";
import { taskKeys } from "./queries";

interface Suggestion {
  id: string;
  title: string;
  why: string;
  changes: AgentUpdateChanges;
}

/** One line describing what a suggestion would actually change. */
function changeLine(c: AgentUpdateChanges): string {
  const parts: string[] = [];
  if (c.subreddits) parts.push(`watch ${c.subreddits.map((s) => `r/${s}`).join(", ")}`);
  if (c.keywords) parts.push(`search for ${c.keywords.slice(0, 4).join(", ")}`);
  if (c.schedule_cron !== undefined) parts.push(scheduleLabel(c.schedule_cron).toLowerCase());
  if (c.instructions) parts.push("rewrite its instructions");
  return parts.join(" · ");
}

/**
 * The agent reviewing its own results and proposing concrete changes. Every
 * agent can do this, owned by an employee or not: improving is part of doing
 * the work. Nothing changes until the user clicks Apply.
 */
export function ImproveCard({ agentId, agentName }: { agentId: string; agentName: string }) {
  const teamId = useActiveTeamId();
  const queryClient = useQueryClient();
  const [verdict, setVerdict] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const review = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("improve-agent", {
        body: { task_id: agentId, team_id: teamId },
      });
      if (error) throw new Error(await readFunctionError(error, "Couldn't run the review."));
      if (data?.error) throw new Error(String(data.error));
      return data as { verdict: string; suggestions: Suggestion[] };
    },
    onSuccess: (d) => {
      setVerdict(d.verdict);
      setSuggestions(d.suggestions ?? []);
      setApplied(new Set());
    },
  });

  const apply = useMutation({
    mutationFn: (s: Suggestion) => updateAgentFields(agentId, s.changes),
    onSuccess: (_r, s) => {
      setApplied((prev) => new Set(prev).add(s.id));
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4" /> How it's doing
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          disabled={review.isPending}
          onClick={() => review.mutate()}
        >
          {review.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {verdict ? "Review again" : "Review my results"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!verdict && !review.isPending && (
          <p className="text-muted-foreground text-sm">
            {agentName} reads back its own runs (what it found, what you posted, what you skipped)
            and proposes changes worth making. Nothing changes until you approve it.
          </p>
        )}

        {review.isError && (
          <p className="text-destructive text-sm">{(review.error as Error).message}</p>
        )}

        {verdict && <p className="text-sm">{verdict}</p>}

        {verdict && suggestions.length === 0 && !review.isPending && (
          <p className="text-muted-foreground text-sm">
            Nothing worth changing right now. Run this again after a few more runs.
          </p>
        )}

        {suggestions.map((s) => {
          const done = applied.has(s.id);
          return (
            <div key={s.id} className="bg-muted/30 rounded-xl border p-3.5">
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-muted-foreground mt-0.5 text-sm">{s.why}</p>
              {changeLine(s.changes) && (
                <p className="text-muted-foreground mt-1.5 text-xs">
                  Changes: {changeLine(s.changes)}
                </p>
              )}
              <div className="mt-2.5">
                {done ? (
                  <span className="text-primary inline-flex items-center gap-1.5 text-xs font-medium">
                    <Check className="size-3.5" /> Applied
                  </span>
                ) : (
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={apply.isPending}
                    onClick={() => apply.mutate(s)}
                  >
                    {apply.isPending && apply.variables?.id === s.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    Apply
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {apply.isError && (
          <p className="text-destructive text-xs">{(apply.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}
