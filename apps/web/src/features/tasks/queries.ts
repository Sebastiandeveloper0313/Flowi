import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export type Task = Tables<"tasks">;
export type TaskRun = Tables<"task_runs">;

export const taskKeys = {
  all: ["tasks"] as const,
  runs: ["task_runs"] as const,
  myTeam: ["team", "mine"] as const,
};

/** Recent runs for the active workspace's tasks; newest first. */
export const runsQueryOptions = (teamId: string | null) =>
  queryOptions({
    queryKey: [...taskKeys.runs, teamId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_runs")
        .select("*")
        .eq("team_id", teamId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });

/** Runs for a single task (RLS-scoped); newest first. */
export const taskRunsQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: [...taskKeys.runs, taskId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_runs")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

/** The current user's team id (everyone gets a personal team on signup). */
export const myTeamQueryOptions = queryOptions({
  queryKey: taskKeys.myTeam,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("team_members")
      .select("team_id")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.team_id ?? null;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

/** The active workspace's recurring tasks (agents), newest first. */
export const tasksQueryOptions = (teamId: string | null) =>
  queryOptions({
    queryKey: [...taskKeys.all, teamId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("team_id", teamId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });
