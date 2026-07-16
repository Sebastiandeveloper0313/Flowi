// Sentrive - signed webhook delivery for custom websites. A team stores an
// endpoint URL plus a signing secret (kept in Vault); every payload we send is
// HMAC-SHA256 signed so the receiving site can verify it really came from
// Sentrive. This is the "bring your own site" alternative to WordPress: any
// stack that can accept a POST works, including AI-built sites.

/** Hex HMAC-SHA256 of `body` with `secret` (the X-Sentrive-Signature value). */
export async function signWebhookBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** POST a signed JSON payload to the team's endpoint. Caller checks res.ok. */
export async function deliverWebhook(
  url: string,
  secret: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const body = JSON.stringify(payload);
  const signature = await signWebhookBody(secret, body);
  return await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sentrive-event": String(payload.event ?? "event"),
      "x-sentrive-signature": `sha256=${signature}`,
    },
    signal: AbortSignal.timeout(20_000),
    body,
  });
}
