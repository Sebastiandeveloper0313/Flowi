import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { useActiveTeamId } from "@/features/workspace/active";
import { supabase } from "@/integrations/supabase/client";

import type { EmployeeMeta } from "./roles";

export type CustomAgent = Tables<"team_agents">;

const keys = { all: ["team-agents"] as const };

/** The workspace's user-created agents, oldest first (stable roster order). */
export function useCustomAgents() {
  const teamId = useActiveTeamId();
  return useQuery({
    queryKey: [...keys.all, teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_agents")
        .select("*")
        .eq("team_id", teamId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });
}

/** Adapt a custom agent row to the meta shape all the roster UI renders. */
export function customAgentMeta(a: CustomAgent): EmployeeMeta {
  return {
    // Custom agents are addressed by their row id wherever ready-made agents
    // use a role slug (routes, config.role, document shelves).
    role: a.id as EmployeeMeta["role"],
    name: a.name,
    emoji: a.emoji || "🤖",
    tint: "bg-slate-100 text-slate-600",
    title: a.title || "Custom agent",
    blurb: a.duties.split("\n")[0]?.slice(0, 80) || "Does the job you gave it.",
    hirePitch: a.duties,
    relevantToolkits: [],
    trainedLine: "Briefed by you.",
    starterTemplates: [],
    custom: true,
  };
}

export function useCreateCustomAgent() {
  const teamId = useActiveTeamId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; emoji: string; title: string; duties: string }) => {
      const { data, error } = await supabase
        .from("team_agents")
        .insert({
          team_id: teamId!,
          name: input.name.slice(0, 40),
          emoji: input.emoji,
          title: input.title.slice(0, 60),
          duties: input.duties.slice(0, 2000),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteCustomAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_agents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}
