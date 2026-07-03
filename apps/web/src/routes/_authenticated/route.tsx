import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { userQueryOptions } from "@/auth/queries";
import { EntrivesSky } from "@/features/dashboard/brand";
import { Sidebar } from "@/features/dashboard/Sidebar";
import { workspaceQueryOptions } from "@/features/onboarding/queries";

import "@/features/dashboard/dashboard.css";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(userQueryOptions).catch(() => null);

    if (!user) {
      throw redirect({
        to: "/auth/login",
        search: { redirect: location.pathname },
      });
    }

    // gate: anyone who hasn't finished onboarding goes there first
    const workspace = await context.queryClient
      .ensureQueryData(workspaceQueryOptions)
      .catch(() => null);
    if (workspace && !workspace.onboarding_completed) {
      throw redirect({ to: "/onboarding" });
    }

    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="flowy-app">
      <EntrivesSky />
      <Sidebar />
      <main className="flowy-main">
        <Outlet />
      </main>
    </div>
  );
}
