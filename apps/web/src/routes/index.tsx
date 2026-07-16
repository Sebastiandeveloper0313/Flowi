import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { returningFromOAuth, userQueryOptions } from "@/auth/queries";
import { initLanding } from "@/features/landing/initLanding";
import landingHtml from "@/features/landing/landing.html?raw";

import "@/features/landing/landing.css";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  // A signed-in visitor, or an email-confirm / OAuth redirect that fell back to
  // the site root (because the app path wasn't in Supabase's redirect allow
  // list), should be pulled into the app instead of stranded on the marketing
  // page. Cheap for anonymous visitors: a localStorage session read, no network
  // unless auth tokens are actually present in the URL.
  beforeLoad: async ({ context }) => {
    if (returningFromOAuth()) {
      const user = await context.queryClient.ensureQueryData(userQueryOptions).catch(() => null);
      if (user) throw redirect({ to: "/home" });
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/home" });
  },
  head: () => ({
    meta: [
      { title: "Sentrive · The AI employee that does the work, on repeat." },
      {
        name: "description",
        content:
          "Sentrive is an AI marketing employee. Brief it once in plain English and it finds leads on Reddit, publishes LinkedIn and Facebook posts, works your inbox, and reports back on schedule. You approve every send. 3-day free trial.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.sentrive.ai/" }],
  }),
  component: HomePage,
});

function HomePage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return initLanding(ref.current);
  }, []);

  return (
    <div
      ref={ref}
      className="flowy"
      // The landing markup is a trusted, build-time asset (our own file),
      // imported as a raw string so the hand-authored SVGs render verbatim.
      dangerouslySetInnerHTML={{ __html: landingHtml }}
    />
  );
}
