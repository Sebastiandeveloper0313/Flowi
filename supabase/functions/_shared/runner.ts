// Shared task-execution logic used by both the on-demand runner (run-task)
// and the scheduler (run-due-tasks), so the two paths can never drift.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface TaskRow {
  id: string;
  team_id: string;
  title: string;
  instructions: string;
  schedule_cron: string | null;
  timezone: string;
  status: string;
}

export interface RunResult {
  status: "succeeded" | "failed" | "skipped";
  run_id?: string;
  summary?: string;
  error?: string;
}

/** Produce the finished work for a task (real Claude call, or a preview when no key is set). */
export async function executeTask(task: TaskRow): Promise<{ summary: string; output: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");

  if (!key) {
    return {
      summary: "Preview run — connect an AI key to make this real",
      output:
        `Flowy received the task “${task.title}”.\n\n` +
        `It would now carry out:\n${task.instructions}\n\n` +
        `Add an ANTHROPIC_API_KEY to the function's secrets and this will return the real, finished result.`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150_000); // hard cap
  try {
    const system =
      "You are Flowy, an AI employee. You are handed a recurring task to do for the user. " +
      "Actually do the task and return the finished result directly — not a plan, not a list of steps, " +
      "not advice. Deliver something ready to use. Be clear and concise. " +
      "Whenever the task needs current, real-world, or external information (news, prices, " +
      "competitors, trends, anything time-sensitive), use the web_search tool to look it up — " +
      "never guess or say you lack access. Base your result on what you find. " +
      "Do not narrate your process (no 'let me search', no step-by-step commentary) — reply with the " +
      "finished deliverable only. Flowy automatically delivers your reply to the user's chosen channel, " +
      "so never try to post/send it yourself and never ask for webhooks, links, or credentials.";

    // Web search is an Anthropic-hosted (server-side) tool: the API runs the
    // searches itself and returns the finished answer. We only loop to resume
    // when a long turn pauses (stop_reason: "pause_turn").
    const messages: { role: string; content: unknown }[] = [
      { role: "user", content: task.instructions },
    ];
    let content: { type: string; text?: string }[] = [];

    for (let i = 0; i < 6; i++) {
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
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }],
          messages,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Claude API error ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = await res.json();
      content = data.content ?? [];
      if (data.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content });
        continue;
      }
      break;
    }

    // Keep only the text produced after the last tool activity — that's the
    // finished answer, without the interleaved "let me search..." narration.
    let lastToolIdx = -1;
    content.forEach((b, idx) => {
      if (b.type !== "text") lastToolIdx = idx;
    });
    const output: string = content
      .slice(lastToolIdx + 1)
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    const firstLine = output.split("\n").find((l) => l.trim()) ?? "Done";
    return { summary: firstLine.slice(0, 140), output: output || "(empty response)" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run one task once: record a run row, execute, and persist the outcome.
 * `admin` must be a service-role client (writes bypass RLS). Authorization is
 * the caller's responsibility — this function trusts that the task is allowed.
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
    const { summary, output } = await executeTask(task);
    await admin
      .from("task_runs")
      .update({ status: "succeeded", summary, output, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    await admin.from("tasks").update({ last_run_at: new Date().toISOString() }).eq("id", task.id);
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
