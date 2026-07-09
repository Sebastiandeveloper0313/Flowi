import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { useUser } from "@/auth/hooks";
import { hideCrisp, identifyCrisp, loadCrisp, showCrisp } from "@/integrations/crisp";

/**
 * Mounts the Crisp live-chat widget app-wide. It identifies the signed-in user
 * and hides the launcher on the AI-chat page (/dashboard) so users never
 * confuse "chat with the team" with "chat with your Sentrive agent".
 */
export function CrispChat() {
  const { data: user } = useUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    loadCrisp();
  }, []);

  useEffect(() => {
    if (user?.email) {
      const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
      identifyCrisp({ email: user.email, name: meta.full_name ?? meta.name ?? null });
    }
  }, [user]);

  useEffect(() => {
    // Keep support chat off the product's own chat surface.
    if (pathname === "/dashboard") hideCrisp();
    else showCrisp();
  }, [pathname]);

  return null;
}
