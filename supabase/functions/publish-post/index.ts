// Sentrive - publish a Reddit post draft to one or more subreddits.
// Authorizes the caller via their JWT + RLS (they can only publish their own
// team's drafts), then posts to each selected subreddit and records a result per
// sub on the draft. The user's click IS the approval, so there's no detour to
// the Approvals page.
import { createClient } from "jsr:@supabase/supabase-js@2";

import { publishDraft } from "../_shared/reddit-post.ts";

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
    const { draft_id, subreddits, title, body } = await req.json().catch(() => ({}));
    if (!draft_id) return json({ error: "draft_id is required" }, 400);
    const subs = Array.isArray(subreddits)
      ? [...new Set(subreddits.map((s) => String(s).replace(/^r\//i, "").trim()).filter(Boolean))]
      : [];
    if (!subs.length) return json({ error: "Pick at least one subreddit." }, 400);
    const finalTitle = typeof title === "string" ? title.trim() : "";
    const finalBody = typeof body === "string" ? body : "";
    if (!finalTitle) return json({ error: "The post needs a title." }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Caller-scoped client: RLS ensures the user can only touch their team's draft.
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: draft, error } = await userClient
      .from("post_drafts")
      .select("id, team_id")
      .eq("id", draft_id)
      .single();
    if (error || !draft) return json({ error: "Draft not found or access denied" }, 403);

    const admin = createClient(url, service);
    const result = await publishDraft(admin, draft.id, draft.team_id, subs, finalTitle, finalBody);
    return json({ result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
