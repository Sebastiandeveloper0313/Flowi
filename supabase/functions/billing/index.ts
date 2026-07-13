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

// deno-lint-ignore no-explicit-any
async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  return data;
}

/** The save offer shown when someone tries to cancel: 50% off, 2 months. */
const RETENTION_PERCENT = 50;
const RETENTION_MONTHS = 2;

// ---- per-workspace add-on billing --------------------------------------
// The base plan includes 1 workspace (the account's primary/oldest team).
// Every additional workspace bills as quantity on a SECOND subscription item,
// priced by STRIPE_WORKSPACE_ADDON_PRICE_ID. The webhook is status-only and
// never reads line items, so a second item doesn't disturb plan sync.

/** Display amount only. The real charge is whatever STRIPE_WORKSPACE_ADDON_PRICE_ID
 *  is set to in Stripe — keep this in sync with that Price. */
const WORKSPACE_ADDON_MONTHLY = 39;

/** Workspaces created before go-live are grandfathered (never billed). Set this
 *  to the actual launch date/time so nothing that already exists gets charged. */
const WORKSPACE_BILLING_LAUNCH = "2026-07-20T00:00:00Z";
const WORKSPACE_BILLING_LAUNCH_MS = Date.parse(WORKSPACE_BILLING_LAUNCH);

/**
 * Count workspaces that should be billed: everything except the primary (base-
 * covered, oldest) and anything created before launch (grandfathered).
 * `teams` must be ordered by created_at ascending (index 0 = primary).
 */
function billableWorkspaces(teams: Array<{ id: string; created_at: string | null }>): number {
  return teams.filter(
    (t, i) => i > 0 && t.created_at != null && Date.parse(t.created_at) >= WORKSPACE_BILLING_LAUNCH_MS,
  ).length;
}

/**
 * Make the subscription's workspace add-on item have exactly `targetQty`.
 * Creates the item on first billable workspace, updates quantity after. A no-op
 * when the add-on Price isn't configured yet, so workspaces stay free until the
 * founder wires it up. Prorations land on the next invoice (create_prorations),
 * which avoids immediate-charge and trial edge cases — switch to always_invoice
 * if you want to bill the moment a workspace is added.
 */
async function syncWorkspaceSlots(subId: string, targetQty: number): Promise<void> {
  const addonPrice = Deno.env.get("STRIPE_WORKSPACE_ADDON_PRICE_ID");
  if (!addonPrice || targetQty <= 0) return;
  const sub = await stripeGet(`subscriptions/${subId}`);
  const items = (sub.items?.data ?? []) as Array<{
    id: string;
    quantity?: number;
    price?: { id?: string };
  }>;
  const existing = items.find((it) => it.price?.id === addonPrice);
  if (existing) {
    if ((existing.quantity ?? 0) === targetQty) return;
    await stripe(`subscription_items/${existing.id}`, {
      quantity: String(targetQty),
      proration_behavior: "create_prorations",
    });
  } else {
    await stripe("subscription_items", {
      subscription: subId,
      price: addonPrice,
      quantity: String(targetQty),
      proration_behavior: "create_prorations",
    });
  }
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

    // The subscription is account-level: it lives on the user's PRIMARY (oldest)
    // workspace, and that's the only team the paywall gate checks
    // (workspaceQueryOptions orders by created_at ascending, limit 1). Resolve it
    // the identical way here. A bare .limit(1) has no ORDER BY, so for a user
    // with multiple workspaces it could return a secondary (free) team — which
    // made the Billing tab show "Start free trial" with no cancel option even
    // though the real subscription lived on the primary workspace.
    const { data: team } = await userClient
      .from("teams")
      .select("id, name, plan, stripe_customer_id, stripe_subscription_id, subscription_status")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!team) return json({ error: "no team for user" }, 403);

    const { action, reason } = await req.json().catch(() => ({}));
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
      const plan = team.plan === "pro" ? "pro" : team.plan === "internal" ? "internal" : "free";
      const { data: teamRows } = await userClient
        .from("teams")
        .select("id, created_at")
        .order("created_at", { ascending: true });
      const totalWorkspaces = teamRows?.length ?? 1;
      const billableWs = billableWorkspaces(teamRows ?? []);
      return json({
        plan,
        subscription_status: team.subscription_status,
        usage,
        // Internal teams aren't metered; show pro numbers so the UI has limits to render.
        limits: DAILY_LIMITS[plan === "internal" ? "pro" : plan],
        workspaces: {
          total: totalWorkspaces,
          billable: billableWs,
          addon_monthly: WORKSPACE_ADDON_MONTHLY,
        },
      });
    }

    // No Stripe needed to say "there is no subscription".
    if (action === "subscription" && !team.stripe_subscription_id) {
      return json({ none: true });
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

    // ---- cancel flow: subscription state, save offer, cancel, resume ----

    if (action === "subscription") {
      const sub = await stripeGet(`subscriptions/${team.stripe_subscription_id}`);
      return json({
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        current_period_end: sub.current_period_end ?? null,
        retention_offer_used: sub.metadata?.retention_offer_used === "true",
        offer: { percent_off: RETENTION_PERCENT, months: RETENTION_MONTHS },
      });
    }

    if (action === "retention_offer") {
      if (!team.stripe_subscription_id) return json({ error: "No active subscription." }, 400);
      const sub = await stripeGet(`subscriptions/${team.stripe_subscription_id}`);
      if (sub.metadata?.retention_offer_used === "true") {
        return json({ error: "This offer was already used." }, 409);
      }
      const coupon = await stripe("coupons", {
        percent_off: String(RETENTION_PERCENT),
        duration: "repeating",
        duration_in_months: String(RETENTION_MONTHS),
        name: `Stay with Sentrive (${RETENTION_PERCENT}% off)`,
      });
      // Applying the offer also un-schedules any pending cancellation.
      await stripe(`subscriptions/${team.stripe_subscription_id}`, {
        "discounts[0][coupon]": coupon.id,
        "metadata[retention_offer_used]": "true",
        cancel_at_period_end: "false",
      });
      return json({ ok: true, percent_off: RETENTION_PERCENT, months: RETENTION_MONTHS });
    }

    if (action === "cancel") {
      if (!team.stripe_subscription_id) return json({ error: "No active subscription." }, 400);
      const params: Record<string, string> = { cancel_at_period_end: "true" };
      if (typeof reason === "string" && reason.trim()) {
        params["cancellation_details[comment]"] = reason.trim().slice(0, 500);
      }
      const sub = await stripe(`subscriptions/${team.stripe_subscription_id}`, params);
      return json({ ok: true, current_period_end: sub.current_period_end ?? null });
    }

    if (action === "resume") {
      if (!team.stripe_subscription_id) return json({ error: "No active subscription." }, 400);
      await stripe(`subscriptions/${team.stripe_subscription_id}`, {
        cancel_at_period_end: "false",
      });
      return json({ ok: true });
    }

    // Reconcile the workspace add-on to the account's current billable count.
    // Called right after a workspace is created (or removed). Idempotent and
    // self-healing: quantity is always derived from the actual set of teams, so
    // a missed call is corrected on the next one.
    if (action === "sync_workspace_billing") {
      if (!team.stripe_subscription_id) return json({ ok: true, slots: 0, configured: false });
      const { data: teamRows } = await userClient
        .from("teams")
        .select("id, created_at")
        .order("created_at", { ascending: true });
      const slots = billableWorkspaces(teamRows ?? []);
      await syncWorkspaceSlots(team.stripe_subscription_id, slots);
      return json({
        ok: true,
        slots,
        monthly_addon: slots * WORKSPACE_ADDON_MONTHLY,
        configured: Boolean(Deno.env.get("STRIPE_WORKSPACE_ADDON_PRICE_ID")),
      });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
