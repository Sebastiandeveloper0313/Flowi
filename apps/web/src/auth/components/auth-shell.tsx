import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { FlowyLogo, FlowySky } from "@/features/dashboard/brand";

import "@/features/dashboard/dashboard.css";

/** Branded wrapper for the auth pages — same clouds + blue look as the app. */
export function AuthShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flowy-app">
      <FlowySky />
      <main className="flowy-auth-main">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-7 flex items-center justify-center gap-2 no-underline">
            <FlowyLogo size={34} />
            <span className="flowy-wordmark">flowy</span>
          </Link>
          {children}
          {footer && <p className="text-muted-foreground mt-5 text-center text-sm">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
