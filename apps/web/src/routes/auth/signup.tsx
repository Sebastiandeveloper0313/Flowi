import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { AuthShell } from "@/auth/components/auth-shell";
import { SignupForm } from "@/auth/components/signup-form";
import { userQueryOptions } from "@/auth/queries";

export const Route = createFileRoute("/auth/signup")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(userQueryOptions).catch(() => null);

    if (user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SignupPage,
});

function SignupPage() {
  return (
    <AuthShell
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/auth/login"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Log in
          </Link>
          <span className="text-muted-foreground mt-2 block text-xs">
            By creating an account you agree to our{" "}
            <Link to="/terms" className="underline underline-offset-4">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline underline-offset-4">
              Privacy Policy
            </Link>
            .
          </span>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
