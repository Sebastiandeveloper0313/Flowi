import { supabase } from "@/integrations/supabase/client";

export interface AgentSuggestion {
  id: string;
  title: string;
  pitch: string;
  instructions: string;
  schedule_cron: string;
  timezone: string;
  channel: string;
  kind: "content" | "reddit_monitor" | "linkedin_post";
  keywords: string[];
  subreddits: string[];
}

const cacheKey = (teamId: string) => `sentrive.suggestions.${teamId}`;

/**
 * Personalized starter agents for the team. Generation costs an AI call, so
 * results are cached per team in localStorage; pass refresh to regenerate.
 */
export async function fetchAgentSuggestions(
  teamId: string,
  opts: { refresh?: boolean } = {},
): Promise<AgentSuggestion[]> {
  if (!opts.refresh) {
    try {
      const cached = localStorage.getItem(cacheKey(teamId));
      if (cached) return JSON.parse(cached) as AgentSuggestion[];
    } catch {
      // ignore bad cache
    }
  }

  const { data, error } = await supabase.functions.invoke("suggest-agents", {
    body: { team_id: teamId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const suggestions = (data?.suggestions ?? []) as AgentSuggestion[];
  try {
    localStorage.setItem(cacheKey(teamId), JSON.stringify(suggestions));
  } catch {
    // storage full or blocked; fine
  }
  return suggestions;
}

/** Fire-and-forget warmup so the dashboard has suggestions ready after onboarding. */
export function prewarmAgentSuggestions(teamId: string) {
  void fetchAgentSuggestions(teamId).catch(() => {});
}
