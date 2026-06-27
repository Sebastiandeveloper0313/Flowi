import { useQuery } from "@tanstack/react-query";

import { profileQueryOptions, workspaceQueryOptions } from "./queries";

export function useWorkspace() {
  return useQuery(workspaceQueryOptions);
}

export function useProfile() {
  return useQuery(profileQueryOptions);
}
