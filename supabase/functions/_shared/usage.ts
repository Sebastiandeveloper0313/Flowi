// Per-team daily usage metering, enforced server-side so a client that
// bypasses the UI still can't drain the workspace's AI budget. Limits depend
// on the team's plan (kept in sync by Stripe webhooks). Fails open on errors
// (metering must never take the product down), fails closed on limits.
import { createClient } from "jsr:@supabase/supabase-js@2";

const DAILY_LIMITS: Record<string, Record<string, number>> = {
  free: {
    chat: 30,
    analyze_website: 5,
    suggest_agents: 5,
    improve_agent: 10,
  },
  pro: {
    chat: 300,
    analyze_website: 20,
    suggest_agents: 20,
    improve_agent: 60,
  },
};

/**
 * Record one usage event and check the team's daily budget for that kind.
 * Returns { ok: false } once the plan's limit is reached.
 */
export async function meter(
  teamId: string,
  kind: string,
): Promise<{ ok: boolean; limit: number; plan: string }> {
  let plan = "free";
  let limit = DAILY_LIMITS.free[kind] ?? 1000;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: team } = await admin.from("teams").select("plan").eq("id", teamId).maybeSingle();
    // Internal (staff) teams are never metered.
    if (team?.plan === "internal") {
      return { ok: true, limit: Number.MAX_SAFE_INTEGER, plan: "internal" };
    }
    plan = team?.plan === "pro" ? "pro" : "free";
    limit = DAILY_LIMITS[plan][kind] ?? 1000;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("kind", kind)
      .gte("created_at", since);
    if ((count ?? 0) >= limit) return { ok: false, limit, plan };
    await admin.from("usage_events").insert({ team_id: teamId, kind });
    return { ok: true, limit, plan };
  } catch {
    return { ok: true, limit, plan }; // fail open: metering errors never block users
  }
}
