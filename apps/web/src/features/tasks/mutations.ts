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
  kind:
    | "content"
    | "reddit_monitor"
    | "linkedin_post"
    | "seo_blog"
    | "reddit_post"
    | "facebook_post";
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
  // A Reddit poster targets specific subreddits; the runner reads them from config.
  if (p.kind === "reddit_post") {
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

export interface AgentUpdateChanges {
  title?: string;
  instructions?: string;
  schedule_cron?: string | null;
  channel?: string;
  keywords?: string[];
  subreddits?: string[];
}

/**
 * Apply a confirmed chat edit to an existing agent. Scalar fields map straight
 * onto the row; keywords/subreddits live in the jsonb config, so we merge them
 * in and pin them as user-set so the Reddit agent honors them instead of
 * re-deriving its own.
 */
export async function updateAgentFields(agentId: string, changes: AgentUpdateChanges) {
  const patch: Record<string, unknown> = {};
  if (changes.title !== undefined) patch.title = changes.title.slice(0, 200);
  if (changes.instructions !== undefined) patch.instructions = changes.instructions;
  if (changes.channel !== undefined) patch.channel = changes.channel;
  if (changes.schedule_cron !== undefined) patch.schedule_cron = changes.schedule_cron;

  if (changes.keywords !== undefined || changes.subreddits !== undefined) {
    const { data: current } = await supabase
      .from("tasks")
      .select("config")
      .eq("id", agentId)
      .single();
    const cfg = ((current?.config as Record<string, unknown> | null) ?? {}) as Record<
      string,
      unknown
    >;
    const nextCfg = { ...cfg };
    if (changes.keywords !== undefined) nextCfg.keywords = changes.keywords;
    if (changes.subreddits !== undefined) nextCfg.subreddits = changes.subreddits;
    nextCfg.keywords_source = "user";
    patch.config = nextCfg;
  }

  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("tasks").update(patch).eq("id", agentId);
  if (error) throw error;
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

/** Set this agent's own Auto/Ask override (null inherits the workspace default). */
export async function updateTaskAutonomy(id: string, mode: "ask" | "auto" | null) {
  const { error } = await supabase.from("tasks").update({ autonomy_mode: mode }).eq("id", id);
  if (error) throw error;
}
