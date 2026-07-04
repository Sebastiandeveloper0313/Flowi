// Sentrive - on-demand task runner ("Run now").
// Authorizes the caller via their JWT + RLS, then runs the task once.
import { createClient } from "jsr:@supabase/supabase-js@2";

import { runTaskOnce } from "../_shared/runner.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { task_id } = await req.json().catch(() => ({}));
    if (!task_id) return json({ error: "task_id is required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Caller-scoped client: RLS ensures the user can only run their own team's task.
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: task, error: taskErr } = await userClient
      .from("tasks")
      .select(
        "id, team_id, title, instructions, channel, schedule_cron, timezone, status, kind, config",
      )
      .eq("id", task_id)
      .single();
    if (taskErr || !task) return json({ error: "Task not found or access denied" }, 403);

    const admin = createClient(url, service);
    const result = await runTaskOnce(admin, task);
    return json({ result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
