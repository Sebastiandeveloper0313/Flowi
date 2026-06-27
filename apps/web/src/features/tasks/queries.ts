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

/** Recent runs across the team's tasks (RLS-scoped); newest first. */
export const runsQueryOptions = queryOptions({
  queryKey: taskKeys.runs,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("task_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data;
  },
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

/** All recurring tasks the user can see (RLS scopes this to their team). */
export const tasksQueryOptions = queryOptions({
  queryKey: taskKeys.all,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});
