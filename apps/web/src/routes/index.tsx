import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { initLanding } from "@/features/landing/initLanding";

import "@/features/landing/landing.css";
import landingHtml from "@/features/landing/landing.html?raw";

export const Route = createFileRoute("/")({
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
