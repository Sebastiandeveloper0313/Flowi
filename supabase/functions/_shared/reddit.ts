// Reddit data shapes + the mapping from Reddit's raw "Listing" JSON to our
// RedditPost. Searching and posting now go through the user's own connected
// Reddit account via Composio (see composio.ts: redditSearch), so the old
// app-only OAuth client is gone; this file is just the shared shape + mapper.

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

/** Map one child of a Reddit "Listing" (child.data) to a RedditPost. */
// deno-lint-ignore no-explicit-any
export function mapRedditChild(child: any): RedditPost {
  const x = child?.data ?? {};
  return {
    external_id: x.name ?? `t3_${x.id ?? ""}`,
    url: x.permalink ? `https://www.reddit.com${x.permalink}` : (x.url ?? ""),
    title: x.title ?? "",
    snippet: String(x.selftext ?? "").slice(0, 600),
    author: x.author ?? "",
    subreddit: x.subreddit ?? "",
    score: x.score ?? 0,
    num_comments: x.num_comments ?? 0,
    created_utc: x.created_utc ?? 0,
  };
}
