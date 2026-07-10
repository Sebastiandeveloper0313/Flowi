import { supabase } from "@/integrations/supabase/client";

import type { SubPostResult } from "./queries";

/** Save edits to a draft (title/body/candidate subreddits) without publishing. */
export async function updatePostDraft(
  id: string,
  patch: { title?: string; body?: string; subreddits?: string[] },
) {
  const { error } = await supabase.from("post_drafts").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setPostDraftStatus(id: string, status: "draft" | "dismissed") {
  const { error } = await supabase.from("post_drafts").update({ status }).eq("id", id);
  if (error) throw error;
}

export interface PublishResult {
  posted: number;
  failed: number;
  results: SubPostResult[];
}

/**
 * Publish a draft to the selected subreddits. Saves the (possibly edited)
 * title/body first so the draft and what goes out agree, then posts through the
 * publish-post function, which records a result per subreddit. Throws if nothing
 * posted, surfacing the first subreddit's error.
 */
export async function publishPostDraft(input: {
  draftId: string;
  subreddits: string[];
  title: string;
  body: string;
}): Promise<PublishResult> {
  await updatePostDraft(input.draftId, { title: input.title, body: input.body });
  const { data, error } = await supabase.functions.invoke("publish-post", {
    body: {
      draft_id: input.draftId,
      subreddits: input.subreddits,
      title: input.title,
      body: input.body,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const result = data?.result as PublishResult | undefined;
  if (!result) throw new Error("Publishing failed. Try again.");
  if (result.posted === 0) {
    const firstError = result.results.find((r) => r.status === "failed")?.error;
    throw new Error(firstError || "Reddit didn't accept the post. Try again.");
  }
  return result;
}
