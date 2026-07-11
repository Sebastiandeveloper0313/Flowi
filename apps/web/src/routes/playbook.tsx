import { createFileRoute } from "@tanstack/react-router";

import { GuidePage } from "@/components/guide-page";
import playbookHtml from "@/features/landing/playbook.html?raw";

const DESC =
  "Two free, no-fluff playbooks on getting users: the complete Reddit growth system for your first users, and the full startup marketing playbook covering every channel that works. From Sentrive.";

export const Route = createFileRoute("/playbook")({
  head: () => ({
    meta: [
      { title: "The Sentrive Playbook · Free Startup Marketing & Reddit Growth Guides | Sentrive" },
      { name: "description", content: DESC },
      { property: "og:type", content: "website" },
      {
        property: "og:title",
        content: "The Sentrive Playbook — free startup marketing & Reddit growth guides",
      },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "https://www.sentrive.ai/playbook" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.sentrive.ai/playbook" }],
  }),
  component: () => <GuidePage bodyHtml={playbookHtml} />,
});
