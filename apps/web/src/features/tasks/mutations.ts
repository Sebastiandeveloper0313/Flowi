import type { TablesInsert } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export interface CreateTaskInput {
  team_id: string;
  title: string;
  instructions: string;
  channel: string;
  schedule_cron: string | null;
}

export async function createTask(input: CreateTaskInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const payload: TablesInsert<"tasks"> = {
    team_id: input.team_id,
    created_by: user.id,
    title: input.title,
    instructions: input.instructions,
    channel: input.channel,
    schedule_cron: input.schedule_cron,
    status: "active",
  };

  const { data, error } = await supabase.from("tasks").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function runTask(taskId: string) {
  const { data, error } = await supabase.functions.invoke("run-task", {
    body: { task_id: taskId },
  });
  if (error) throw error;
  return data;
}

export async function setTaskStatus(id: string, status: "active" | "paused") {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
