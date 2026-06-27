import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { AuthShell } from "@/auth/components/auth-shell";
import { LoginForm } from "@/auth/components/login-form";
import { userQueryOptions } from "@/auth/queries";

export const Route = createFileRoute("/auth/login")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(userQueryOptions).catch(() => null);

    if (user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  return (
    <AuthShell
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            to="/auth/signup"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
