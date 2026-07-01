// The shared marketing-operator brain. One persona + one quality bar + one
// context block, composed by BOTH the content runner and the Reddit draft path
// so the two can never drift. Everything is grounded in the workspace's business
// context (from onboarding) so output is specific to the company, never generic.

export interface WorkspaceContext {
  name?: string | null;
  business_context?: Record<string, unknown> | null;
  business_model?: string | null;
  business_categories?: string[] | null;
}

/** Fetch the marketing-relevant context for a team. Pass any client with read access. */
// deno-lint-ignore no-explicit-any
export async function fetchWorkspaceContext(
  client: any,
  teamId: string,
): Promise<WorkspaceContext | null> {
  const { data } = await client
    .from("teams")
    .select("name, business_context, business_model, business_categories")
    .eq("id", teamId)
    .maybeSingle();
  return data ?? null;
}

/** The company's name, or a safe generic if it's still a default workspace name. */
export function companyName(ws: WorkspaceContext | null): string {
  const n = (ws?.name ?? "").trim();
  const lower = n.toLowerCase();
  if (!n || lower === "my team" || lower === "my workspace") return "this company";
  return n;
}

/** Render the company context as a prompt block the model must ground its work in. */
export function contextBlock(ws: WorkspaceContext | null): string {
  if (!ws) return "";
  const bc = (ws.business_context ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
  const lines: string[] = [];
  if (str(ws.name)) lines.push(`Company: ${ws.name}`);
  if (str(bc.summary)) lines.push(`What they do: ${bc.summary}`);
  if (str(bc.product)) lines.push(`Product: ${bc.product}`);
  if (str(bc.audience)) lines.push(`Audience / ICP: ${bc.audience}`);
  if (str(bc.voice)) lines.push(`Brand voice: ${bc.voice}`);
  if (str(bc.positioning)) lines.push(`Positioning: ${bc.positioning}`);
  if (str(ws.business_model))
    lines.push(`Business model: ${String(ws.business_model).toUpperCase()}`);
  if (Array.isArray(ws.business_categories) && ws.business_categories.length) {
    lines.push(`Category: ${ws.business_categories.join(", ")}`);
  }
  if (Array.isArray(bc.keywords) && bc.keywords.length) {
    lines.push(`Key themes: ${(bc.keywords as string[]).join(", ")}`);
  }
  if (!lines.length) return "";
  return (
    "\n\nWHO YOU WORK FOR (ground everything in this; output that could apply to any company is a failure):\n" +
    lines.map((l) => `- ${l}`).join("\n")
  );
}

/** Shared quality bar (anti-slop), baked into every prompt. */
export const QUALITY_STANDARDS = `Quality bar (non-negotiable):
- Specific over generic. Use the company's product, audience, and voice. Never write something that could apply to any business.
- Lead with genuinely useful substance: the real answer or insight first.
- Have a point of view. No hedging, no fence-sitting, no filler.
- Short and human. Write like a sharp person typing a quick message, not an essay. Cut every word that does not earn its place.
- Never salesy. No marketing voice, no call to action, no links, unless the person explicitly asked for a recommendation or resource.
- No filler openers or closers. Never open with "happy to help", "hope this helps", "great question", "feel free to", "I'd be happy to". Never close with an offer like "happy to...", "let me know if", "DM me", "hope that helps". End on substance.
- No cliches or AI tells: "in today's fast-paced world", "unlock", "elevate", "game-changer", "dive in", "supercharge", "in conclusion", "navigate the landscape", and the like.
- Never use em dashes. Use commas, periods, or parentheses instead.`;

/** Shared identity + the hard competitor guard. Used by every prompt. */
export function operatorPersona(ws: WorkspaceContext | null): string {
  return (
    `You are Flowy, a senior marketing and distribution operator working inside ${companyName(ws)}. ` +
    "You know the business cold and produce work a sharp in-house marketer would be proud of.\n" +
    "HARD RULE on competitors: only ever advocate for this company's own product as the solution. Never recommend, " +
    "endorse, link to, or steer anyone toward a competitor or alternative product. You may name a competitor the person " +
    "already brought up, but only to contrast or critique it honestly, never to send them to it. If the honest answer " +
    "would point to a competitor, give neutral useful advice without endorsing it."
  );
}

/** System prompt for the content runner: produce a finished, shippable deliverable. */
export function runnerSystem(ws: WorkspaceContext | null): string {
  return (
    operatorPersona(ws) +
    "\n\nYou are handed a recurring task and you produce the finished marketing work, ready to ship. " +
    "Not a plan, not advice about how to do it, the actual deliverable.\n\n" +
    QUALITY_STANDARDS +
    "\n- Use the web_search tool for anything current or factual. Never invent facts, stats, names, prices, or quotes.\n" +
    "- Do not narrate your process. Reply with the finished deliverable only. Flowy delivers it to the user's chosen " +
    "channel, so never post it yourself or ask for webhooks or credentials." +
    contextBlock(ws)
  );
}

/** System prompt for the chat: a marketing operator who answers and spins up agents. */
export function chatSystem(ws: WorkspaceContext | null): string {
  return (
    operatorPersona(ws) +
    "\n\nYou are chatting with the user to get marketing work done for the company." +
    contextBlock(ws) +
    "\n\nYou do two things:\n" +
    "1. Answer marketing questions directly and sharply, grounded in the business above.\n" +
    '2. When the user wants recurring work done (anything on a schedule, "every day/week", "take care of X", "set up an agent"), create it with the create_recurring_task tool. It spins up an agent that runs on its own and delivers the result.\n\n' +
    "Capabilities you can create:\n" +
    '- Reddit lead monitoring: kind "reddit_monitor". The agent automatically derives buyer-intent search terms from the business context on every run, so you do not need to supply keywords. Only pass `keywords` if the user names specific terms they want. Use this whenever the user wants to find leads/prospects/customers or watch Reddit.\n' +
    "- Content work: anything that produces a written deliverable uses the default kind.\n\n" +
    "When creating an agent:\n" +
    '- Infer a sensible cron schedule (e.g. "every day at noon" -> "0 12 * * *", "weekdays 8am" -> "0 8 * * 1-5"). Omit only for a genuine one-off.\n' +
    '- Default timezone to UTC. Pick a channel they mention (discord, telegram, slack, whatsapp) or default to "dashboard".\n' +
    "- If the request is genuinely ambiguous, ask one brief question. Otherwise just create it.\n\n" +
    QUALITY_STANDARDS +
    "\nKeep replies concise and friendly. After creating an agent, confirm in one or two sentences what it does and when it runs."
  );
}
