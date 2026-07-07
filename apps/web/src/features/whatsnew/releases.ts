import { Bot, Layers, MessageSquare, Send, type LucideIcon } from "lucide-react";

export interface ReleaseHighlight {
  icon: LucideIcon;
  title: string;
  text: string;
}

export interface Release {
  /** Stable, unique, sortable id. Bump this to make a release pop up once. */
  id: string;
  title: string;
  date: string;
  highlights: ReleaseHighlight[];
}

/**
 * What's-new entries, newest FIRST. Only releases listed here ever pop up, so
 * routine merges stay silent, add an entry only when something is worth telling
 * users about. The dialog shows the top (newest) unseen entry.
 */
export const RELEASES: Release[] = [
  {
    id: "2026-07-multi-product",
    title: "Run all your products from one account",
    date: "July 2026",
    highlights: [
      {
        icon: Layers,
        title: "Multiple products",
        text: "Add a product from the sidebar and each gets its own website, agents, and leads, kept fully separate. One plan covers them all.",
      },
      {
        icon: Bot,
        title: "Sentrive learns your voice",
        text: "Edit a reply before posting and future drafts start sounding like you. Set your reply style anytime in Settings.",
      },
      {
        icon: Send,
        title: "Post replies in one click",
        text: "Approve a Reddit reply and it posts right then, no detour through the Approvals page.",
      },
      {
        icon: MessageSquare,
        title: "Sharper Reddit lead-finding",
        text: "The lead agent now scans far more of Reddit and drafts replies that mention your product naturally.",
      },
    ],
  },
];
