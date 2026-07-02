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

export interface AgentProposalInput {
  title: string;
  instructions: string;
  channel: string;
  schedule_cron: string | null;
  timezone: string;
  kind: "content" | "reddit_monitor";
  keywords: string[];
  subreddits: string[];
  proposalId?: string; // stamped into config so a proposal card can find its agent
}

/** Create a real agent from a chat proposal (the "Create agent" button). */
export async function createAgentFromProposal(teamId: string, p: AgentProposalInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const config: Record<string, unknown> = p.proposalId ? { proposal_id: p.proposalId } : {};
  if (p.kind === "reddit_monitor") {
    config.keywords = p.keywords;
    config.subreddits = p.subreddits;
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      team_id: teamId,
      created_by: user.id,
      title: p.title.slice(0, 200),
      instructions: p.instructions,
      channel: p.channel,
      schedule_cron: p.schedule_cron,
      timezone: p.timezone,
      status: "active",
      kind: p.kind,
      config,
    })
    .select("id, title")
    .single();
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

/** Update an agent's config (e.g. pin reddit_monitor keywords/subreddits). */
export async function updateTaskConfig(id: string, config: Record<string, unknown>) {
  const { error } = await supabase.from("tasks").update({ config }).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

/** Delete several agents at once. */
export async function bulkDeleteTasks(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from("tasks").delete().in("id", ids);
  if (error) throw error;
}

/** Change an agent's schedule (5-field cron, or null for run-once). */
export async function updateTaskSchedule(id: string, scheduleCron: string | null) {
  const { error } = await supabase
    .from("tasks")
    .update({ schedule_cron: scheduleCron })
    .eq("id", id);
  if (error) throw error;
}

/** Change where an agent delivers its result ("dashboard" | "email"). */
export async function updateTaskChannel(id: string, channel: string) {
  const { error } = await supabase.from("tasks").update({ channel }).eq("id", id);
  if (error) throw error;
}
