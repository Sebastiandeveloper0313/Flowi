import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export type Workspace = Tables<"teams">;

export const onboardingKeys = {
  workspace: ["workspace"] as const,
  profile: ["profile"] as const,
};

/** The current user's workspace (their team), with onboarding fields. */
export const workspaceQueryOptions = queryOptions({
  queryKey: onboardingKeys.workspace,
  queryFn: async (): Promise<Workspace | null> => {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  staleTime: 5 * 60 * 1000,
});

export const profileQueryOptions = queryOptions({
  queryKey: onboardingKeys.profile,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .maybeSingle();
    if (error) throw error;
    return data;
  },
});
