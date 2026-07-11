import { createFileRoute } from "@tanstack/react-router";

import { GuidePage } from "@/components/guide-page";
import marketingHtml from "@/features/landing/guide-marketing.html?raw";

const DESC =
  "The full startup marketing playbook in one place: Reddit, paid ads, UGC, influencer, faceless branding, GEO, and the viral writing framework. When to use each channel and the numbers that actually matter. From Sentrive.";

export const Route = createFileRoute("/guides/marketing-playbook")({
  head: () => ({
    meta: [
      {
        title: "The Startup Marketing Playbook · Every Channel That Actually Works | Sentrive",
      },
      { name: "description", content: DESC },
      { property: "og:type", content: "article" },
      {
        property: "og:title",
        content: "The Startup Marketing Playbook — every channel that actually works",
      },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "https://www.sentrive.ai/guides/marketing-playbook" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.sentrive.ai/guides/marketing-playbook" }],
  }),
  component: () => <GuidePage bodyHtml={marketingHtml} />,
});
