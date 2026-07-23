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

/**
 * Upload a picture for a custom employee. Stored in the team-scoped
 * agent-media bucket under "<team>/avatars/", public-read so the app can
 * render it directly.
 */
export async function uploadAgentAvatar(teamId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > 4 * 1024 * 1024) throw new Error("Image must be 4MB or smaller.");
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${teamId}/avatars/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("agent-media")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from("agent-media").getPublicUrl(path).data.publicUrl;
}

/** Adapt a custom agent row to the meta shape all the roster UI renders. */
export function customAgentMeta(a: CustomAgent): EmployeeMeta {
  return {
    // Custom agents are addressed by their row id wherever ready-made agents
    // use a role slug (routes, config.role, document shelves).
    role: a.id as EmployeeMeta["role"],
    name: a.name,
    emoji: a.emoji ?? "",
    avatar: a.avatar_url ?? undefined,
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
    mutationFn: async (input: {
      name: string;
      emoji: string;
      title: string;
      duties: string;
      avatarUrl?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("team_agents")
        .insert({
          team_id: teamId!,
          name: input.name.slice(0, 40),
          emoji: input.emoji,
          title: input.title.slice(0, 60),
          duties: input.duties.slice(0, 2000),
          avatar_url: input.avatarUrl ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

/** Change a custom employee's picture, emoji, or name later. */
export function useUpdateCustomAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; emoji?: string; title?: string; avatar_url?: string | null };
    }) => {
      const { error } = await supabase.from("team_agents").update(patch).eq("id", id);
      if (error) throw error;
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
