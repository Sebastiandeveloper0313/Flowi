// Reddit read client. Uses app-only OAuth (one Flowy app, env creds) to search
// public Reddit reliably — Reddit blocks unauthenticated/HTML-scraping requests.
// Per-user OAuth (for posting on the user's behalf) comes later via `connections`.

const UA = "web:flowy-lead-monitor:0.1 (by /u/flowy-app)";

let cached: { token: string; expires: number } | null = null;

/** True when the Flowy Reddit app credentials are configured. */
export function redditConnected(): boolean {
  return !!(Deno.env.get("REDDIT_CLIENT_ID") && Deno.env.get("REDDIT_CLIENT_SECRET"));
}

/** App-only access token (client_credentials), cached until shortly before expiry. */
async function appToken(): Promise<string> {
  const id = Deno.env.get("REDDIT_CLIENT_ID");
  const secret = Deno.env.get("REDDIT_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Reddit is not connected (missing REDDIT_CLIENT_ID/SECRET).");

  const now = Date.now();
  if (cached && cached.expires > now + 30_000) return cached.token;

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${id}:${secret}`),
      "content-type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Reddit auth failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  cached = { token: data.access_token, expires: now + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export interface RedditPost {
  external_id: string; // reddit fullname, e.g. t3_abc123
  url: string;
  title: string;
  snippet: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
}

export interface RedditSearchOpts {
  limit?: number;
  sort?: "new" | "relevance" | "top" | "hot" | "comments";
  time?: "hour" | "day" | "week" | "month" | "year" | "all";
  subreddit?: string;
}

/** Search Reddit link posts for a query (optionally within one subreddit). */
export async function searchReddit(
  query: string,
  opts: RedditSearchOpts = {},
): Promise<RedditPost[]> {
  const token = await appToken();
  const { limit = 15, sort = "new", time = "week", subreddit } = opts;

  const base = subreddit
    ? `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/search`
    : "https://oauth.reddit.com/search";
  const params = new URLSearchParams({
    q: query,
    sort,
    t: time,
    limit: String(limit),
    type: "link",
    raw_json: "1",
  });
  if (subreddit) params.set("restrict_sr", "1");

  const res = await fetch(`${base}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
  });
  if (!res.ok) {
    throw new Error(`Reddit search failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const children = data?.data?.children ?? [];
  // deno-lint-ignore no-explicit-any
  return children.map((c: any) => {
    const x = c.data ?? {};
    return {
      external_id: x.name ?? `t3_${x.id}`,
      url: `https://www.reddit.com${x.permalink}`,
      title: x.title ?? "",
      snippet: (x.selftext ?? "").slice(0, 600),
      author: x.author ?? "",
      subreddit: x.subreddit ?? "",
      score: x.score ?? 0,
      num_comments: x.num_comments ?? 0,
      created_utc: x.created_utc ?? 0,
    } as RedditPost;
  });
}
