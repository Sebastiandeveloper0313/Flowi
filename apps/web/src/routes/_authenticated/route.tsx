import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { userQueryOptions } from "@/auth/queries";
import { SentriveSky } from "@/features/dashboard/brand";
import { Sidebar } from "@/features/dashboard/Sidebar";
import { workspaceQueryOptions } from "@/features/onboarding/queries";
import { WhatsNewDialog } from "@/features/whatsnew/WhatsNewDialog";
import { ActiveWorkspaceProvider } from "@/features/workspace/active";

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

    // hard paywall: the app requires an active trial or subscription.
    // "internal" is the unmetered staff plan; it never sees the paywall.
    if (
      workspace &&
      workspace.onboarding_completed &&
      workspace.plan !== "pro" &&
      workspace.plan !== "internal"
    ) {
      throw redirect({ to: "/start-trial", search: { billing: undefined } });
    }

    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <ActiveWorkspaceProvider>
      <div className="flowy-app">
        <SentriveSky />
        <Sidebar />
        <main className="flowy-main">
          <Outlet />
        </main>
        <WhatsNewDialog />
      </div>
    </ActiveWorkspaceProvider>
  );
}
