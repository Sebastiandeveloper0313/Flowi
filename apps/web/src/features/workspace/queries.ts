import type { Tables } from "@workspace/supabase/types";

export type WorkspaceRow = Tables<"teams">;

// The active workspace is served from the ["workspaces"] list (see active.tsx),
// so mutations that change a workspace invalidate that key to refresh it.
export const workspaceKeys = {
  current: ["workspaces"] as const,
};
