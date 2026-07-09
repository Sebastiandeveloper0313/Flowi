// Sentrive - delete-account. Permanently deletes the signed-in user and all of
// their data. Ordering matters: teams.created_by is ON DELETE NO ACTION, so the
// auth user can't be removed while their teams exist. We cancel any Stripe
// subscription, delete the teams they own (which cascades tasks, leads, chats,
// approvals, etc.), then delete the auth user (which cascades profiles,
// team_members, email logs, and auth rows). Irreversible.
import { createClient } from "jsr:@supabase/supabase-js@2";

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

/** Cancel a Stripe subscription immediately. Best effort: never blocks deletion. */
async function cancelSubscription(subscriptionId: string) {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return;
  await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${key}` },
  }).catch(() => {});
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, service);

    // The workspaces this user owns. Cancel their subscriptions, then delete them
    // (cascades all of each team's data).
    const { data: teams } = await admin
      .from("teams")
      .select("id, stripe_subscription_id")
      .eq("created_by", user.id);

    for (const t of teams ?? []) {
      if (t.stripe_subscription_id) await cancelSubscription(t.stripe_subscription_id);
    }
    if (teams && teams.length) {
      const { error: teamErr } = await admin
        .from("teams")
        .delete()
        .in(
          "id",
          teams.map((t) => t.id),
        );
      if (teamErr) return json({ error: `Could not delete workspaces: ${teamErr.message}` }, 500);
    }

    // Finally the auth user (cascades profiles, team_members, email logs, sessions).
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) return json({ error: `Could not delete account: ${delErr.message}` }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
