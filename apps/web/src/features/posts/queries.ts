import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export type PostDraft = Tables<"post_drafts">;

/** One subreddit's posting result, stored in post_drafts.posts (jsonb). */
export interface SubPostResult {
  subreddit: string;
  status: "posted" | "failed";
  url?: string;
  error?: string;
  at?: string;
}

/** Read a draft's per-subreddit results out of the jsonb column, safely. */
export function draftResults(draft: PostDraft): SubPostResult[] {
  return Array.isArray(draft.posts) ? (draft.posts as unknown as SubPostResult[]) : [];
}

export const postKeys = {
  all: ["post_drafts"] as const,
};

/** Post drafts written by one agent, newest first. */
export const postDraftsByTaskQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: [...postKeys.all, taskId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("post_drafts")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
