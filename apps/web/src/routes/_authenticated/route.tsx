import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { userQueryOptions } from "@/auth/queries";
import { FlowySky } from "@/features/dashboard/brand";
import { Sidebar } from "@/features/dashboard/Sidebar";

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

    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="flowy-app">
      <FlowySky />
      <Sidebar />
      <main className="flowy-main">
        <Outlet />
      </main>
    </div>
  );
}
