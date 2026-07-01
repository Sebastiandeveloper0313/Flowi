// Flowy - analyze-website. Turns a company URL (or a manual description) into
// structured business context the marketing operator uses to avoid generic output.
// Uses Claude with the hosted web_fetch/web_search tools (no extra API key).
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

const SYSTEM = `You are a senior marketing strategist building a brief on a company so an AI marketing operator can produce on-brand, non-generic work for it.

Research the company from the provided website (use the web_fetch and web_search tools to read its pages) or from the description given. Then return ONLY a JSON object - no prose, no markdown fences - with exactly these keys:
{
  "summary": "2-3 sentence plain-English summary of the business",
  "what_they_do": "what the company actually does / sells",
  "product": "the core product or service and its key value props",
  "audience": "who their customers are (ICP), described specifically",
  "voice": "their brand voice and tone in a few words (e.g. 'bold, technical, irreverent')",
  "positioning": "how they're positioned vs alternatives, and their differentiator",
  "keywords": ["5-10", "topical", "keywords", "and", "themes"]
}

Be specific and evidence-based from what you find, never generic filler. If a field is genuinely unknowable, use a best-effort inference and keep it concise. Never use em dashes anywhere in the JSON values; use commas, periods, or parentheses.`;

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { website_url, description } = await req.json().catch(() => ({}));
    const url = typeof website_url === "string" ? website_url.trim() : "";
    const desc = typeof description === "string" ? description.trim() : "";
    if (!url && !desc) return json({ error: "website_url or description is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: membership } = await userClient
      .from("team_members")
      .select("team_id")
      .limit(1)
      .maybeSingle();
    const teamId = membership?.team_id;
    if (!teamId) return json({ error: "no team for user" }, 403);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "AI is not configured on the server." }, 503);

    const userMessage = url
      ? `Research and build the brief for this company website: ${url}`
      : `Build the brief from this description of the business:\n\n${desc}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let content: { type: string; text?: string }[] = [];
    try {
      const messages: { role: string; content: unknown }[] = [
        { role: "user", content: userMessage },
      ];
      const tools = url
        ? [
            { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
            { type: "web_search_20260209", name: "web_search", max_uses: 3 },
          ]
        : undefined;

      for (let i = 0; i < 5; i++) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-8",
            max_tokens: 2048,
            system: SYSTEM,
            ...(tools ? { tools } : {}),
            messages,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          return json({ error: `Claude API error ${res.status}: ${body.slice(0, 300)}` }, 502);
        }
        const data = await res.json();
        content = data.content ?? [];
        if (data.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content });
          continue;
        }
        break;
      }
    } finally {
      clearTimeout(timeout);
    }

    const text = content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
    const context = extractJson(text);
    if (!context) return json({ error: "Could not analyze the business. Try again." }, 502);

    // Persist to the workspace (RLS: owner can update their team).
    const patch: Record<string, unknown> = { business_context: context };
    if (url) patch.website_url = url;
    if (desc) patch.business_description = desc;
    const { error: upErr } = await userClient.from("teams").update(patch).eq("id", teamId);
    if (upErr) return json({ error: `Could not save context: ${upErr.message}` }, 500);

    return json({ context });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
