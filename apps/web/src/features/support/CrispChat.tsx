import { useEffect } from "react";

import { useUser } from "@/auth/hooks";
import { identifyCrisp, loadCrisp } from "@/integrations/crisp";

/**
 * Mounts the Crisp live-chat widget app-wide (including the dashboard) and
 * identifies the signed-in user so conversations aren't anonymous and tie back
 * to their PostHog session.
 */
export function CrispChat() {
  const { data: user } = useUser();

  useEffect(() => {
    loadCrisp();
  }, []);

  useEffect(() => {
    if (user?.email) {
      const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
      identifyCrisp({ email: user.email, name: meta.full_name ?? meta.name ?? null });
    }
  }, [user]);

  return null;
}
