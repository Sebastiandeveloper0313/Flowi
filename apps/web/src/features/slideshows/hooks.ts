import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { setSlideshowStatus } from "./mutations";
import { slideshowKeys, slideshowsByTaskQueryOptions } from "./queries";

export function useAgentSlideshows(taskId: string) {
  return useQuery(slideshowsByTaskQueryOptions(taskId));
}

export function useSetSlideshowStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "draft" | "exported" | "dismissed" }) =>
      setSlideshowStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: slideshowKeys.all }),
  });
}
