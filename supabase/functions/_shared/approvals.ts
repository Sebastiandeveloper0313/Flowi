// Shared approval logic. Queueing gates high-stakes tool calls behind a human
// "yes" (used by the runner, the web chat, and the Slack bot, so the paths can
// never drift), and deciding executes or rejects a queued action (used by the
// approvals endpoint and the Slack approve/reject buttons).
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { describeToolCall, executeComposioTool } from "./composio.ts";

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
 * Also pings the team's Slack (if installed) with approve/reject buttons.
 */
export async function queueApproval(
  client: SupabaseClient,
  input: QueueApprovalInput,
): Promise<{ message: string; title: string }> {
  const { title, detail } = describeToolCall(input.toolSlug, input.toolArgs ?? {});
  const { data: row, error } = await client
    .from("approvals")
    .insert({
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
    })
    .select("id")
    .single();
  if (error || !row) {
    return {
      title,
      message: `Could not queue this action for approval: ${error?.message ?? "unknown error"}`,
    };
  }

  // Best effort: never let a notification failure affect the queueing.
  notifySlack(input.teamId, input.createdBy ?? null, row.id, title, detail).catch(() => {});

  return {
    title,
    message:
      `Queued for the user's approval: ${title}. It runs only once they approve it ` +
      `on the Approvals page. Do not retry it or claim it was done; tell the user it ` +
      `is waiting for their approval.`,
  };
}

/**
 * Decide a pending approval: reject it, or execute the stored tool call and
 * record the outcome. Authorization is the caller's responsibility.
 */
export async function decideApproval(
  admin: SupabaseClient,
  approvalId: string,
  decision: "approve" | "reject",
  decidedBy: string | null,
): Promise<{ status: "rejected" | "executed" | "failed" | "conflict"; error?: string }> {
  const { data: approval } = await admin
    .from("approvals")
    .select("id, team_id, tool_slug, tool_args, status")
    .eq("id", approvalId)
    .maybeSingle();
  if (!approval) return { status: "conflict", error: "Approval not found" };
  if (approval.status !== "pending") {
    return { status: "conflict", error: `Already ${approval.status}` };
  }
  const decidedAt = new Date().toISOString();

  if (decision === "reject") {
    await admin
      .from("approvals")
      .update({ status: "rejected", decided_by: decidedBy, decided_at: decidedAt })
      .eq("id", approval.id);
    return { status: "rejected" };
  }

  try {
    const result = await executeComposioTool(
      approval.team_id,
      approval.tool_slug,
      (approval.tool_args as Record<string, unknown>) ?? {},
    );
    await admin
      .from("approvals")
      .update({
        status: "executed",
        result: result.slice(0, 8000),
        decided_by: decidedBy,
        decided_at: decidedAt,
      })
      .eq("id", approval.id);
    return { status: "executed" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("approvals")
      .update({
        status: "failed",
        result: msg.slice(0, 8000),
        decided_by: decidedBy,
        decided_at: decidedAt,
      })
      .eq("id", approval.id);
    return { status: "failed", error: msg };
  }
}

/**
 * DM the requesting user (or the team owner) in the team's installed Slack
 * workspace with approve/reject buttons for a freshly queued approval.
 * Requires the im:write scope on the workspace token; failures are silent.
 */
async function notifySlack(
  teamId: string,
  createdBy: string | null,
  approvalId: string,
  title: string,
  detail: string | null,
): Promise<void> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: ws } = await admin
    .from("slack_workspaces")
    .select("bot_token")
    .eq("installed_by_team_id", teamId)
    .limit(1)
    .maybeSingle();
  if (!ws?.bot_token) return;

  // Who to ping: the requester, else the team owner.
  let userId = createdBy;
  if (!userId) {
    const { data: owner } = await admin
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    userId = owner?.user_id ?? null;
  }
  if (!userId) return;
  const { data: userRes } = await admin.auth.admin.getUserById(userId);
  const email = userRes?.user?.email;
  if (!email) return;

  const lookup = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { authorization: `Bearer ${ws.bot_token}` } },
  ).then((r) => r.json());
  const slackUser = lookup?.user?.id;
  if (!slackUser) return;

  const preview = (detail ?? "").slice(0, 400);
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ws.bot_token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: slackUser,
      text: `Approval waiting: ${title}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Approval waiting:* ${title}${preview ? `\n>${preview.replaceAll("\n", "\n>")}` : ""}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              style: "primary",
              text: { type: "plain_text", text: "Approve" },
              action_id: "approve",
              value: approvalId,
            },
            {
              type: "button",
              style: "danger",
              text: { type: "plain_text", text: "Reject" },
              action_id: "reject",
              value: approvalId,
            },
          ],
        },
      ],
    }),
  });
}
