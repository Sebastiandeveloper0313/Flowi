// Composio client (REST, Deno-native). Gives agents real tools (Gmail, etc.)
// scoped to each workspace's own connected accounts. The workspace's team_id is
// the Composio user_id, so every team only ever touches its own connections.
const BASE = "https://backend.composio.dev/api/v3";

// Auth configs are project-level blueprints (managed OAuth). Created once per
// toolkit; ids are stable. TODO: create/store these dynamically as we add toolkits.
const AUTH_CONFIGS: Record<string, string> = {
  gmail: "ac_v7EeY-JplVT0",
};

// Curated toolset per toolkit. Read + draft tools run instantly; write tools
// (see WRITE_TOOLS) reach the outside world and are gated behind a human approval.
const CURATED_TOOLS: Record<string, string[]> = {
  gmail: [
    "GMAIL_FETCH_EMAILS",
    "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
    "GMAIL_LIST_THREADS",
    "GMAIL_GET_PROFILE",
    "GMAIL_CREATE_EMAIL_DRAFT",
    "GMAIL_SEND_EMAIL",
  ],
};

// High-stakes tools that reach the outside world. When the model calls one of
// these we never execute it directly; we queue an approval and let the user
// decide. Everything not listed here is a safe read/draft that runs instantly.
const WRITE_TOOLS = new Set<string>(["GMAIL_SEND_EMAIL"]);

/** True if a tool takes a real, outward-facing action that needs user approval. */
export function isWriteTool(slug: string): boolean {
  return WRITE_TOOLS.has(slug);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * A human title + detail for a proposed write action, shown on the approval card.
 * Falls back to a generic description for tools we don't specifically format.
 */
export function describeToolCall(
  slug: string,
  // deno-lint-ignore no-explicit-any
  args: Record<string, any>,
): { title: string; detail: string } {
  if (slug === "GMAIL_SEND_EMAIL") {
    const to = str(args.recipient_email || args.to || args.recipient).trim();
    const subject = str(args.subject).trim();
    const body = str(args.body || args.message_body || args.message).trim();
    const preview = body.length > 280 ? `${body.slice(0, 280)}…` : body;
    return {
      title: to ? `Send email to ${to}` : "Send an email",
      detail: [subject && `Subject: ${subject}`, preview].filter(Boolean).join("\n\n"),
    };
  }
  const toolkit = slug.split("_")[0] ?? "";
  const nice = toolkit ? toolkit.charAt(0) + toolkit.slice(1).toLowerCase() : "a tool";
  return {
    title: `Run ${slug}`,
    detail: `Flowy wants to take an action in ${nice}.`,
  };
}

export const SUPPORTED_TOOLKITS = Object.keys(AUTH_CONFIGS);

export function composioEnabled(): boolean {
  return !!Deno.env.get("COMPOSIO_API_KEY");
}

// deno-lint-ignore no-explicit-any
async function composio(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": Deno.env.get("COMPOSIO_API_KEY") ?? "",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Composio ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface Connection {
  toolkit: string;
  status: string;
  id: string;
}

/** A workspace's connected accounts (any status). */
export async function listConnections(userId: string): Promise<Connection[]> {
  const d = await composio(`/connected_accounts?user_ids=${encodeURIComponent(userId)}`);
  // deno-lint-ignore no-explicit-any
  return (d.items ?? []).map((a: any) => ({
    toolkit: a.toolkit?.slug ?? "",
    status: a.status ?? "",
    id: a.id ?? "",
  }));
}

/** Active connected toolkit slugs for a workspace. */
export async function connectedToolkits(userId: string): Promise<string[]> {
  const conns = await listConnections(userId);
  return [...new Set(conns.filter((c) => c.status === "ACTIVE").map((c) => c.toolkit))];
}

/** Anthropic-format tools for a workspace's connected toolkits (curated subset). */
export async function toolsForUser(userId: string): Promise<AnthropicTool[]> {
  const toolkits = await connectedToolkits(userId);
  const out: AnthropicTool[] = [];
  for (const slug of toolkits) {
    const curated = CURATED_TOOLS[slug];
    const d = await composio(`/tools?toolkit_slug=${encodeURIComponent(slug)}&limit=60`);
    // deno-lint-ignore no-explicit-any
    for (const t of d.items ?? []) {
      if (curated && !curated.includes(t.slug)) continue;
      out.push({
        name: t.slug,
        description: String(t.description ?? t.name ?? "").slice(0, 800),
        input_schema: t.input_parameters ?? { type: "object", properties: {} },
      });
    }
  }
  return out;
}

/** Execute a Composio tool for a workspace, returning a compact result string for the model. */
export async function executeComposioTool(
  userId: string,
  slug: string,
  // deno-lint-ignore no-explicit-any
  args: Record<string, any>,
): Promise<string> {
  const d = await composio(`/tools/execute/${encodeURIComponent(slug)}`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, arguments: args ?? {} }),
  });
  // Generous cap: big enough to carry a batch of emails with bodies, bounded so a
  // huge tool result can't blow the model's context.
  return JSON.stringify(d).slice(0, 24000);
}

/** True if a tool name belongs to Composio (vs. our own tools / server tools). */
export function isComposioTool(name: string): boolean {
  return /^[A-Z0-9]+_[A-Z0-9_]+$/.test(name);
}

/** Start a connection: returns a hosted-auth redirect URL for the user to authorize. */
export async function createConnectLink(
  userId: string,
  toolkit: string,
): Promise<{ redirect_url: string; connected_account_id: string }> {
  const authConfigId = AUTH_CONFIGS[toolkit];
  if (!authConfigId) throw new Error(`Toolkit '${toolkit}' is not available yet.`);
  return composio(`/connected_accounts/link`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, auth_config_id: authConfigId }),
  });
}
