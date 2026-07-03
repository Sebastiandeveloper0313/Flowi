// Senable - Stripe webhook. The single writer of billing state: checkout
// completion and subscription lifecycle events flip the team's plan.
// Authorized by Stripe's webhook signature (fail closed).
import { createClient } from "jsr:@supabase/supabase-js@2";

const enc = new TextEncoder();

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
        const teamId = obj.metadata?.team_id;
        const status = String(obj.status ?? "");
        const pro = status === "active" || status === "trialing" || status === "past_due";
        const patch = {
          plan: pro ? "pro" : "free",
          subscription_status: status,
          stripe_subscription_id: obj.id ?? null,
        };
        if (teamId) await admin.from("teams").update(patch).eq("id", teamId);
        else if (obj.customer) {
          await admin.from("teams").update(patch).eq("stripe_customer_id", obj.customer);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const patch = {
          plan: "free",
          subscription_status: "canceled",
          stripe_subscription_id: null,
        };
        const teamId = obj.metadata?.team_id;
        if (teamId) await admin.from("teams").update(patch).eq("id", teamId);
        else if (obj.customer) {
          await admin.from("teams").update(patch).eq("stripe_customer_id", obj.customer);
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
