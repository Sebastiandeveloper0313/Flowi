import { createFileRoute, redirect } from "@tanstack/react-router";

import { userQueryOptions } from "@/auth/queries";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { workspaceQueryOptions } from "@/features/onboarding/queries";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(userQueryOptions).catch(() => null);
    if (!user) {
      throw redirect({ to: "/auth/login", search: { redirect: "/onboarding" } });
    }
    const ws = await context.queryClient.ensureQueryData(workspaceQueryOptions).catch(() => null);
    if (ws?.onboarding_completed) {
      throw redirect({ to: "/home" });
    }
  },
  component: Onboarding,
});
