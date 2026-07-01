// Shared approval-gating logic. When an agent or the chat wants to take a
// high-stakes action (a write tool), we queue it here for a human "yes" instead
// of executing it. Both the runner and the chat use this so the two paths can
// never drift on what needs approval.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { describeToolCall } from "./composio.ts";

export interface QueueApprovalInput {
  teamId: string;
  toolSlug: string;
  toolArgs: Record<string, unknown>;
  source: "agent" | "chat";
  agentTitle?: string | null;
  taskId?: string | null;
  runId?: string | null;
  createdBy?: string | null;
}

/**
 * Queue a high-stakes tool call for the user's approval instead of executing it.
 * Returns the short message to hand back to the model as the tool result, so it
 * knows the action is pending and should not retry or claim it was done.
 */
export async function queueApproval(
  client: SupabaseClient,
  input: QueueApprovalInput,
): Promise<{ message: string; title: string }> {
  const { title, detail } = describeToolCall(input.toolSlug, input.toolArgs ?? {});
  const { error } = await client.from("approvals").insert({
    team_id: input.teamId,
    task_id: input.taskId ?? null,
    run_id: input.runId ?? null,
    created_by: input.createdBy ?? null,
    source: input.source,
    agent_title: input.agentTitle ?? null,
    tool_slug: input.toolSlug,
    tool_args: input.toolArgs ?? {},
    title,
    detail,
    status: "pending",
  });
  if (error) {
    return {
      title,
      message: `Could not queue this action for approval: ${error.message}`,
    };
  }
  return {
    title,
    message:
      `Queued for the user's approval: ${title}. It runs only once they approve it ` +
      `on the Approvals page. Do not retry it or claim it was done; tell the user it ` +
      `is waiting for their approval.`,
  };
}
