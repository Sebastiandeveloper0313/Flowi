// Per-team daily usage metering, enforced server-side so a client that
// bypasses the UI still can't drain the workspace's AI budget. Fails open on
// errors (metering must never take the product down), fails closed on limits.
import { createClient } from "jsr:@supabase/supabase-js@2";

/** Generous defaults; real billing replaces these later. */
const DAILY_LIMITS: Record<string, number> = {
  chat: 300,
  analyze_website: 20,
};

/**
 * Record one usage event and check the team's daily budget for that kind.
 * Returns { ok: false } once the limit is reached.
 */
export async function meter(teamId: string, kind: string): Promise<{ ok: boolean; limit: number }> {
  const limit = DAILY_LIMITS[kind] ?? 1000;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("kind", kind)
      .gte("created_at", since);
    if ((count ?? 0) >= limit) return { ok: false, limit };
    await admin.from("usage_events").insert({ team_id: teamId, kind });
    return { ok: true, limit };
  } catch {
    return { ok: true, limit }; // fail open: metering errors never block users
  }
}
