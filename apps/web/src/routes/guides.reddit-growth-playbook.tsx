import { createFileRoute } from "@tanstack/react-router";

import { GuidePage } from "@/components/guide-page";
import redditHtml from "@/features/landing/guide-reddit.html?raw";

const DESC =
  "A complete, free system for getting your first users from Reddit: find the right subreddits, write titles that get clicked, post without sounding like an ad, and work the first-30-minutes launch window. The exact playbook, from Sentrive.";

export const Route = createFileRoute("/guides/reddit-growth-playbook")({
  head: () => ({
    meta: [
      {
        title: "How to Get Your First Users from Reddit · The Reddit Growth Playbook | Sentrive",
      },
      { name: "description", content: DESC },
      { property: "og:type", content: "article" },
      {
        property: "og:title",
        content: "The Reddit Growth Playbook — get your first users from Reddit, free",
      },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "https://www.sentrive.ai/guides/reddit-growth-playbook" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://www.sentrive.ai/og.png" },
      { name: "twitter:image", content: "https://www.sentrive.ai/og.png" },
    ],
    links: [{ rel: "canonical", href: "https://www.sentrive.ai/guides/reddit-growth-playbook" }],
  }),
  component: () => <GuidePage bodyHtml={redditHtml} />,
});
