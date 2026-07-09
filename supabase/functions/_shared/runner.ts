// Shared task-execution logic used by both the on-demand runner (run-task)
// and the scheduler (run-due-tasks), so the two paths can never drift.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { queueApproval } from "./approvals.ts";
import {
  composioEnabled,
  executeComposioTool,
  isComposioTool,
  isWriteTool,
  toolsForUser,
} from "./composio.ts";
import {
  fetchWorkspaceContext,
  runnerSystem,
  taskAutonomy,
  type WorkspaceContext,
} from "./marketing.ts";
import { runRedditMonitor } from "./reddit-monitor.ts";

export interface TaskRow {
  id: string;
  team_id: string;
  title: string;
  instructions: string;
  channel?: string;
  schedule_cron: string | null;
  timezone: string;
  status: string;
  kind?: string;
  config?: Record<string, unknown> | null;
  autonomy_mode?: string | null;
}

export interface RunResult {
  status: "succeeded" | "failed" | "skipped";
  run_id?: string;
  summary?: string;
  error?: string;
}

/** How to gate write actions: the client to record approvals with and the run they belong to. */
export interface ExecuteContext {
  client: SupabaseClient;
  runId?: string | null;
}

/** Produce the finished work for a task (real Claude call, or a preview when no key is set). */
export async function executeTask(
  task: TaskRow,
  ws: WorkspaceContext | null = null,
  ctx: ExecuteContext | null = null,
): Promise<{ summary: string; output: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");

  if (!key) {
    return {
      summary: "Preview run - connect an AI key to make this real",
      output:
        `Sentrive received the task “${task.title}”.\n\n` +
        `It would now carry out:\n${task.instructions}\n\n` +
        `Add an ANTHROPIC_API_KEY to the function's secrets and this will return the real, finished result.`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150_000); // hard cap
  try {
    let system = runnerSystem(ws);
    // A LinkedIn poster doesn't just draft: it must publish. The autonomy gate
    // still decides whether the post goes out now (auto) or waits for approval.
    if (task.kind === "linkedin_post") {
      system +=
        "\n\nThis agent is a LinkedIn poster. Write ONE on-brand LinkedIn post grounded in the " +
        "business and aimed at its audience (a strong hook, real substance, a clear takeaway; no " +
        "hashtag spam, no em dashes), then PUBLISH it by calling the LinkedIn create-post tool. Do " +
        "not just draft it, actually call the tool. If LinkedIn is not connected, say so and stop.";
    }

    // Tools available this run:
    //  - web_search: Anthropic-hosted (server-side); the API runs it and pauses
    //    the turn (stop_reason "pause_turn") while it works.
    //  - the workspace's connected tools (Gmail, etc.) via Composio: client-side
    //    tools we execute (stop_reason "tool_use"), scoped to this team's accounts.
    const connectedTools = composioEnabled()
      ? await toolsForUser(task.team_id).catch(() => [])
      : [];
    const tools: unknown[] = [
      { type: "web_search_20260209", name: "web_search", max_uses: 5 },
      ...connectedTools,
    ];

    const messages: { role: string; content: unknown }[] = [
      { role: "user", content: task.instructions },
    ];
    // deno-lint-ignore no-explicit-any
    let content: any[] = [];

    for (let i = 0; i < 12; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-opus-4-8",
          max_tokens: 4096,
          system,
          tools,
          messages,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Claude API error ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = await res.json();
      content = data.content ?? [];

      // Server tool (web_search) in flight: resume the turn.
      if (data.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content });
        continue;
      }

      // Client tool calls (Composio): execute each against this team's accounts.
      if (data.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content });
        const results: unknown[] = [];
        for (const b of content) {
          if (b.type !== "tool_use") continue;
          if (!isComposioTool(b.name)) {
            results.push({
              type: "tool_result",
              tool_use_id: b.id,
              content: `Unknown tool: ${b.name}`,
              is_error: true,
            });
            continue;
          }
          // High-stakes actions: run unattended only in auto mode (this agent's
          // own setting, or the workspace default); otherwise queue for approval.
          if (isWriteTool(b.name) && taskAutonomy(task, ws) === "ask" && ctx?.client) {
            const { message } = await queueApproval(ctx.client, {
              teamId: task.team_id,
              toolSlug: b.name,
              toolArgs: b.input ?? {},
              source: "agent",
              agentTitle: task.title,
              taskId: task.id,
              runId: ctx.runId ?? null,
            });
            results.push({ type: "tool_result", tool_use_id: b.id, content: message });
            continue;
          }
          try {
            const out = await executeComposioTool(task.team_id, b.name, b.input ?? {});
            results.push({ type: "tool_result", tool_use_id: b.id, content: out });
          } catch (e) {
            results.push({
              type: "tool_result",
              tool_use_id: b.id,
              content: `Error: ${e instanceof Error ? e.message : String(e)}`,
              is_error: true,
            });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      break;
    }

    // Keep only the text produced after the last tool activity - that's the
    // finished answer, without the interleaved "let me search..." narration.
    let lastToolIdx = -1;
    content.forEach((b, idx) => {
      if (b.type !== "text") lastToolIdx = idx;
    });
    const raw: string = content
      .slice(lastToolIdx + 1)
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    // Deterministically honor the no-em-dash rule regardless of the model.
    const output = raw.replace(/\s*—\s*/g, ", ");
    const firstLine = output.split("\n").find((l) => l.trim()) ?? "Done";
    return { summary: firstLine.slice(0, 140), output: output || "(empty response)" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Deliver a finished result to the user, per the agent's channel. "email"
 * sends the output to the team's own connected Gmail address (a self-send:
 * it is reporting to the user, not an outward-facing action, so it does not
 * go through the approval gate). Delivery failures never fail the run.
 */
async function deliverResult(task: TaskRow, summary: string, output: string): Promise<void> {
  if (task.channel !== "email" || !composioEnabled()) return;
  try {
    const profileRaw = await executeComposioTool(task.team_id, "GMAIL_GET_PROFILE", {});
    const email = profileRaw.match(/"emailAddress"\s*:\s*"([^"]+)"/)?.[1];
    if (!email) return;
    await executeComposioTool(task.team_id, "GMAIL_SEND_EMAIL", {
      recipient_email: email,
      subject: `${task.title}: ${summary}`.slice(0, 180),
      body: `${output}\n\n--\nSent by Sentrive, from your agent "${task.title}". Manage it on your Agents page.`,
    });
  } catch (e) {
    console.error("email delivery failed:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Run one task once: record a run row, execute, and persist the outcome.
 * `admin` must be a service-role client (writes bypass RLS). Authorization is
 * the caller's responsibility - this function trusts that the task is allowed.
 */
export async function runTaskOnce(admin: SupabaseClient, task: TaskRow): Promise<RunResult> {
  // Avoid piling up duplicate concurrent runs for the same task.
  const { count } = await admin
    .from("task_runs")
    .select("id", { count: "exact", head: true })
    .eq("task_id", task.id)
    .eq("status", "running");
  if ((count ?? 0) > 0) {
    return { status: "skipped", summary: "A run is already in progress" };
  }

  const { data: run, error: runErr } = await admin
    .from("task_runs")
    .insert({
      task_id: task.id,
      team_id: task.team_id,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runErr || !run) {
    return { status: "failed", error: runErr?.message ?? "Could not create run" };
  }

  try {
    const ws = await fetchWorkspaceContext(admin, task.team_id);
    const { summary, output } =
      task.kind === "reddit_monitor"
        ? await runRedditMonitor(admin, task, ws)
        : await executeTask(task, ws, { client: admin, runId: run.id });
    await admin
      .from("task_runs")
      .update({ status: "succeeded", summary, output, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    await admin.from("tasks").update({ last_run_at: new Date().toISOString() }).eq("id", task.id);
    await deliverResult(task, summary, output);
    return { status: "succeeded", run_id: run.id, summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("task_runs")
      .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return { status: "failed", run_id: run.id, error: msg };
  }
}
