// Sentrive - Stripe webhook. The single writer of billing state: checkout
// completion and subscription lifecycle events flip the team's plan.
// Authorized by Stripe's webhook signature (fail closed).
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { sendCancelConfirmation } from "../_shared/lifecycle-emails.ts";

const enc = new TextEncoder();

/**
 * The team a Stripe subscription belongs to (by team_id metadata, else customer
 * id), with its currently-tracked subscription id, so a stale event for an old
 * subscription can't clobber an active plan.
 */
async function resolveTeam(
  admin: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  obj: any,
): Promise<{ id: string; stripe_subscription_id: string | null } | null> {
  const teamId = obj.metadata?.team_id;
  if (teamId) {
    const { data } = await admin
      .from("teams")
      .select("id, stripe_subscription_id")
      .eq("id", teamId)
      .maybeSingle();
    if (data) return data;
  }
  if (obj.customer) {
    const { data } = await admin
      .from("teams")
      .select("id, stripe_subscription_id")
      .eq("stripe_customer_id", obj.customer)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

/** Verify Stripe-Signature: t=<ts>,v1=<hmac sha256 of "<ts>.<body>">. */
async function validSignature(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return false;
  const header = req.headers.get("stripe-signature") ?? "";
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=", 2) as [string, string]),
  );
  const ts = parts["t"];
  const given = parts["v1"];
  if (!ts || !given || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const body = await req.text();
  if (!(await validSignature(req, body))) {
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }

  // deno-lint-ignore no-explicit-any
  let event: any = {};
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const obj = event.data?.object ?? {};

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const teamId = obj.metadata?.team_id;
        if (teamId) {
          await admin
            .from("teams")
            .update({
              plan: "pro",
              stripe_customer_id: obj.customer ?? null,
              stripe_subscription_id: obj.subscription ?? null,
              subscription_status: "active",
            })
            .eq("id", teamId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const status = String(obj.status ?? "");
        const pro = status === "active" || status === "trialing" || status === "past_due";
        const team = await resolveTeam(admin, obj);
        // A pro subscription always wins and becomes the team's current one. A
        // downgrade only applies if this IS the current sub, so a stale/old
        // subscription's event can't clobber an active plan (webhooks arrive out
        // of order, e.g. an old trial's cancel landing after a fresh paid sub).
        if (
          team &&
          (pro || !team.stripe_subscription_id || team.stripe_subscription_id === obj.id)
        ) {
          await admin
            .from("teams")
            .update({
              plan: pro ? "pro" : "free",
              subscription_status: status,
              stripe_subscription_id: obj.id ?? null,
            })
            .eq("id", team.id);
        }

        // A cancellation scheduled for period end: confirm it by email, once
        // (the send is deduped per subscription, so repeated updates are safe).
        if (obj.cancel_at_period_end === true && obj.id && team) {
          await sendCancelConfirmation(admin, {
            teamId: team.id,
            subscriptionId: obj.id,
            periodEndUnix: obj.current_period_end ?? null,
          }).catch((e) => console.error("cancel confirm email failed:", e));
        }
        break;
      }
      case "customer.subscription.deleted": {
        const team = await resolveTeam(admin, obj);
        // Only downgrade if the deleted sub is the team's CURRENT one. Deleting an
        // old trial sub after the user re-subscribed must NOT cancel their active
        // plan, this exact out-of-order case locked a paying customer out.
        if (team && (!team.stripe_subscription_id || team.stripe_subscription_id === obj.id)) {
          await admin
            .from("teams")
            .update({
              plan: "free",
              subscription_status: "canceled",
              stripe_subscription_id: null,
              subscription_canceled_at: new Date().toISOString(),
            })
            .eq("id", team.id);
        }
        break;
      }
    }
  } catch (e) {
    console.error("webhook handling failed:", e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ error: "handler failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
  });
});
