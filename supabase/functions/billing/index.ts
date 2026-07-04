// Sentrive - billing. Stripe Checkout to upgrade, the hosted Billing Portal to
// manage/cancel, and a usage summary for the Billing tab. Authorized as the
// user; plan state itself is written only by the stripe-webhook function.
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://www.sentrive.ai";

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

/** Mirrors _shared/usage.ts, surfaced so the UI can render meters. */
const DAILY_LIMITS: Record<string, Record<string, number>> = {
  free: { chat: 30, analyze_website: 5 },
  pro: { chat: 300, analyze_website: 20 },
};

// deno-lint-ignore no-explicit-any
async function stripe(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  return data;
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

    const { data: team } = await userClient
      .from("teams")
      .select("id, name, plan, stripe_customer_id, stripe_subscription_id, subscription_status")
      .limit(1)
      .maybeSingle();
    if (!team) return json({ error: "no team for user" }, 403);

    const { action } = await req.json().catch(() => ({}));
    const admin = createClient(url, service);

    if (action === "summary") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const usage: Record<string, number> = {};
      for (const kind of ["chat", "analyze_website"]) {
        const { count } = await admin
          .from("usage_events")
          .select("id", { count: "exact", head: true })
          .eq("team_id", team.id)
          .eq("kind", kind)
          .gte("created_at", since);
        usage[kind] = count ?? 0;
      }
      const plan = team.plan === "pro" ? "pro" : "free";
      return json({
        plan,
        subscription_status: team.subscription_status,
        usage,
        limits: DAILY_LIMITS[plan],
      });
    }

    if (!Deno.env.get("STRIPE_SECRET_KEY")) {
      return json({ error: "Billing is not configured on the server." }, 503);
    }

    // Reuse the team's Stripe customer or create one.
    async function customerId(): Promise<string> {
      if (team!.stripe_customer_id) return team!.stripe_customer_id;
      const customer = await stripe("customers", {
        email: user!.email ?? "",
        name: team!.name ?? "",
        "metadata[team_id]": team!.id,
      });
      await admin.from("teams").update({ stripe_customer_id: customer.id }).eq("id", team!.id);
      return customer.id;
    }

    if (action === "checkout") {
      const price = Deno.env.get("STRIPE_PRICE_ID");
      if (!price) return json({ error: "Billing is not configured on the server." }, 503);
      // 3-day free trial, but only for teams that never had a subscription --
      // otherwise cancel/resubscribe would mint endless trials.
      const hadSubscription =
        Boolean(team.stripe_subscription_id) || Boolean(team.subscription_status);
      const params: Record<string, string> = {
        mode: "subscription",
        customer: await customerId(),
        "line_items[0][price]": price,
        "line_items[0][quantity]": "1",
        success_url: `${APP_URL}/start-trial?billing=success`,
        cancel_url: `${APP_URL}/start-trial?billing=cancelled`,
        "metadata[team_id]": team.id,
        "subscription_data[metadata][team_id]": team.id,
      };
      if (!hadSubscription) params["subscription_data[trial_period_days]"] = "3";
      const session = await stripe("checkout/sessions", params);
      return json({ url: session.url });
    }

    if (action === "portal") {
      const session = await stripe("billing_portal/sessions", {
        customer: await customerId(),
        return_url: `${APP_URL}/settings`,
      });
      return json({ url: session.url });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
