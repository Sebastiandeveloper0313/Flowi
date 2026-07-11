// Composio client (REST, Deno-native). Gives agents real tools (Gmail, etc.)
// scoped to each workspace's own connected accounts. The workspace's team_id is
// the Composio user_id, so every team only ever touches its own connections.
import { mapRedditChild, type RedditPost } from "./reddit.ts";

const BASE = "https://backend.composio.dev/api/v3";

// Auth configs are project-level blueprints (managed OAuth). Created once per
// toolkit; ids are stable. TODO: create/store these dynamically as we add toolkits.
const AUTH_CONFIGS: Record<string, string> = {
  gmail: "ac_v7EeY-JplVT0",
  reddit: "ac_uSlAKR4JLASx",
  // Includes organization scopes (w_organization_social, r_organization_admin)
  // so posts can go out as a company page, not just the member. Connections
  // made under the older personal-only config (ac_1mFve3TdyssX) keep working
  // for personal posts; reconnecting grants the org scopes.
  linkedin: "ac_vcR_em3p9qDI",
  facebook: "ac_4DxrKBJQ6XMZ",
};

// Curated toolset per toolkit. Read tools run instantly; write tools (see
// WRITE_TOOLS) reach the outside world and are gated behind a human approval.
// We intentionally omit GMAIL_CREATE_EMAIL_DRAFT: with the approval gate, ASK
// mode already gives "review before it sends", so a separate draft path is
// redundant and led the model to quietly draft instead of proposing a send.
const CURATED_TOOLS: Record<string, string[]> = {
  gmail: [
    "GMAIL_FETCH_EMAILS",
    "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
    "GMAIL_LIST_THREADS",
    "GMAIL_GET_PROFILE",
    "GMAIL_SEND_EMAIL",
    "GMAIL_REPLY_TO_THREAD",
  ],
  reddit: [
    "REDDIT_SEARCH_ACROSS_SUBREDDITS",
    "REDDIT_RETRIEVE_POST_COMMENTS",
    "REDDIT_POST_REDDIT_COMMENT",
    "REDDIT_CREATE_REDDIT_POST",
  ],
  linkedin: [
    // GET_MY_INFO gives the member URN; GET_COMPANY_INFO lists the company
    // pages the user administers (org URNs), so posts can go out as the page.
    "LINKEDIN_GET_MY_INFO",
    "LINKEDIN_GET_COMPANY_INFO",
    "LINKEDIN_CREATE_LINKED_IN_POST",
  ],
  facebook: [
    // GET_USER_PAGES lists the pages the user manages (page ids the writes need).
    "FACEBOOK_GET_USER_PAGES",
    "FACEBOOK_GET_PAGE_POSTS",
    "FACEBOOK_GET_PAGE_CONVERSATIONS",
    "FACEBOOK_GET_CONVERSATION_MESSAGES",
    "FACEBOOK_CREATE_POST",
    "FACEBOOK_CREATE_PHOTO_POST",
    "FACEBOOK_CREATE_VIDEO_POST",
    "FACEBOOK_CREATE_COMMENT",
    "FACEBOOK_SEND_MESSAGE",
  ],
};

// High-stakes tools that reach the outside world. When the model calls one of
// these we never execute it directly; we queue an approval and let the user
// decide. Everything not listed here is a safe read that runs instantly.
const WRITE_TOOLS = new Set<string>([
  "GMAIL_SEND_EMAIL",
  "GMAIL_REPLY_TO_THREAD",
  "REDDIT_POST_REDDIT_COMMENT",
  "REDDIT_CREATE_REDDIT_POST",
  "LINKEDIN_CREATE_LINKED_IN_POST",
  "FACEBOOK_CREATE_POST",
  "FACEBOOK_CREATE_PHOTO_POST",
  "FACEBOOK_CREATE_VIDEO_POST",
  "FACEBOOK_CREATE_COMMENT",
  "FACEBOOK_SEND_MESSAGE",
]);

/** True if a tool takes a real, outward-facing action that needs user approval. */
export function isWriteTool(slug: string): boolean {
  return WRITE_TOOLS.has(slug);
}

/**
 * Detect a Composio action that failed at the provider even though the HTTP call
 * succeeded. Composio wraps results as { data, error, successful }, and on a
 * provider error (e.g. a LinkedIn API-version rejection) it still returns 200
 * with successful:false — so a "green" tool result can actually be a failure.
 * Returns the error message when the action didn't go through, else null.
 */
export function composioActionError(result: string): string | null {
  try {
    const d = JSON.parse(result) as { successful?: boolean; error?: unknown };
    if (d && d.successful === false) {
      const err = typeof d.error === "string" && d.error.trim() ? d.error.trim() : null;
      return err ?? "The action did not go through.";
    }
  } catch {
    // Non-JSON or truncated payload: we can't tell, so don't flag it as failed.
  }
  return null;
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
  if (slug === "REDDIT_POST_REDDIT_COMMENT") {
    const text = str(args.text || args.body).trim();
    const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text;
    return { title: "Post a reply on Reddit", detail: preview };
  }
  if (slug === "LINKEDIN_CREATE_LINKED_IN_POST") {
    const text = str(args.commentary || args.text).trim();
    const preview = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    const asCompany = str(args.author).startsWith("urn:li:organization:");
    return {
      title: asCompany ? "Publish a post on your company page" : "Publish a LinkedIn post",
      detail: preview,
    };
  }
  if (slug === "FACEBOOK_CREATE_POST") {
    const text = str(args.message).trim();
    const preview = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    return { title: "Publish a post on your Facebook page", detail: preview };
  }
  if (slug === "FACEBOOK_CREATE_COMMENT") {
    const text = str(args.message || args.comment).trim();
    return { title: "Reply to a comment on your Facebook page", detail: text.slice(0, 400) };
  }
  if (slug === "FACEBOOK_SEND_MESSAGE") {
    const text = str(args.message || args.text).trim();
    return { title: "Send a Messenger reply from your page", detail: text.slice(0, 400) };
  }
  if (slug === "GMAIL_REPLY_TO_THREAD") {
    const to = str(args.recipient_email || args.to).trim();
    const body = str(args.message_body || args.body || args.message).trim();
    const preview = body.length > 400 ? `${body.slice(0, 400)}…` : body;
    return { title: to ? `Reply to ${to}` : "Reply to an email", detail: preview };
  }
  if (slug === "REDDIT_CREATE_REDDIT_POST") {
    const sub = str(args.subreddit).replace(/^r\//i, "").trim();
    const title = str(args.title).trim();
    const body = str(args.text || args.body).trim();
    const preview = body.length > 400 ? `${body.slice(0, 400)}…` : body;
    return {
      title: sub ? `Post to r/${sub}` : "Post to Reddit",
      detail: [title && `Title: ${title}`, preview].filter(Boolean).join("\n\n"),
    };
  }
  if (slug === "FACEBOOK_CREATE_PHOTO_POST") {
    const text = str(args.message || args.caption).trim();
    return { title: "Publish a photo post on your Facebook page", detail: text.slice(0, 400) };
  }
  if (slug === "FACEBOOK_CREATE_VIDEO_POST") {
    const text = str(args.description || args.message).trim();
    return { title: "Publish a video post on your Facebook page", detail: text.slice(0, 400) };
  }
  const toolkit = slug.split("_")[0] ?? "";
  const nice = toolkit ? toolkit.charAt(0) + toolkit.slice(1).toLowerCase() : "a tool";
  return {
    title: `Run ${slug}`,
    detail: `Sentrive wants to take an action in ${nice}.`,
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

/**
 * Search Reddit through the team's own connected account, returning parsed posts.
 * Uses the raw execute endpoint (not executeComposioTool) so the full listing is
 * parsed without the model-facing truncation.
 */
/**
 * Pull the post-listing children out of a Composio Reddit tool result. Reddit
 * listings are { kind: "Listing", data: { children: [...] } }, but Composio
 * nests the payload differently per tool (search puts it under search_results),
 * so try the known shapes then fall back to a shallow scan for `children`.
 */
// deno-lint-ignore no-explicit-any
function listingChildren(d: any): any[] {
  const paths = [
    d?.data?.search_results?.data?.children,
    d?.data?.data?.children,
    d?.data?.children,
    d?.data?.posts,
    d?.data?.response?.data?.children,
  ];
  for (const p of paths) if (Array.isArray(p)) return p;
  const stack = [d?.data];
  let hops = 0;
  while (stack.length && hops++ < 300) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    // deno-lint-ignore no-explicit-any
    if (Array.isArray((cur as any).children)) return (cur as any).children;
    for (const v of Object.values(cur)) if (v && typeof v === "object") stack.push(v);
  }
  return [];
}

// deno-lint-ignore no-explicit-any
function childrenToPosts(children: any[]): RedditPost[] {
  if (!Array.isArray(children)) return [];
  return children
    .filter((c: { kind?: string }) => c?.kind === "t3" || c?.kind === undefined)
    .map(mapRedditChild)
    .filter((p: RedditPost) => p.external_id && p.title);
}

/** Keyword search across all of Reddit via the user's connected account. */
export async function redditSearch(
  userId: string,
  query: string,
  opts: { sort?: string; limit?: number } = {},
): Promise<RedditPost[]> {
  const d = await composio(`/tools/execute/REDDIT_SEARCH_ACROSS_SUBREDDITS`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000), // don't let one slow query hang the run
    body: JSON.stringify({
      user_id: userId,
      arguments: {
        search_query: query,
        sort: opts.sort ?? "new",
        limit: opts.limit ?? 15,
      },
    }),
  });
  return childrenToPosts(listingChildren(d));
}

/**
 * Fetch a subreddit's listing (new/hot/top) directly. This is the freshest,
 * highest-signal source for lead monitoring: scoping to the communities buyers
 * post in beats loose global keyword search on both precision and volume.
 */
export async function redditSubredditPosts(
  userId: string,
  subreddit: string,
  opts: { sort?: "new" | "hot" | "top" | "rising"; limit?: number } = {},
): Promise<RedditPost[]> {
  const d = await composio(`/tools/execute/REDDIT_RETRIEVE_REDDIT_POST`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      user_id: userId,
      arguments: {
        subreddit: subreddit.replace(/^r\//i, "").trim(),
        sort: opts.sort ?? "new",
        max_results: Math.min(100, Math.max(1, opts.limit ?? 100)),
      },
    }),
  });
  return childrenToPosts(listingChildren(d));
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
