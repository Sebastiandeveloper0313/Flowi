import {
  Briefcase,
  Eye,
  FileText,
  Lightbulb,
  type LucideIcon,
  MessageSquare,
  PenLine,
  Radar,
} from "lucide-react";

import type { AgentProposalInput } from "./mutations";

/**
 * A ready-made agent the user can add in one click from the Library. Every
 * template maps to a runner capability that actually works today (its `kind`),
 * so the gallery never offers something that would fail on the first run. New
 * capabilities become new templates here.
 */
export interface AgentTemplate {
  id: string; // stable slug, stamped into the created agent's config as proposal_id
  name: string;
  /** One line on the card, the promise in plain language. */
  tagline: string;
  /** What each run actually produces, shown as the outcome chip. */
  outcome: string;
  description: string;
  icon: LucideIcon;
  category: string;
  kind: AgentProposalInput["kind"];
  schedule_cron: string;
  scheduleLabel: string; // human label so the card needn't parse cron
  channel: "dashboard" | "email";
  instructions: string;
}

/**
 * Section order on the page. Every template's `category` must be one of these.
 */
export const TEMPLATE_CATEGORIES = ["Leads & research", "Social media", "SEO & content"] as const;

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "reddit-lead-finder",
    name: "Reddit Lead Finder",
    tagline: "Finds people describing the problem you solve, and drafts the reply.",
    outcome: "Drafts replies for review",
    description:
      "Every day it searches Reddit for buyer-intent posts in your space, then writes a helpful, non-spammy reply for each real match. You approve before anything is sent.",
    icon: Radar,
    category: "Leads & research",
    kind: "reddit_monitor",
    schedule_cron: "0 9 * * *",
    scheduleLabel: "Daily, 9am",
    channel: "dashboard",
    instructions:
      "Each day, search Reddit for people describing the problem our business solves, asking for recommendations, or venting about the pain point we address. For each genuine match, draft a helpful reply that leads with real advice and mentions us only where it fits naturally. Surface each one as a lead with its draft reply for review. Never post anything automatically.",
  },
  {
    id: "linkedin-poster",
    name: "LinkedIn Poster",
    tagline: "Publishes an on-brand LinkedIn post for you every week.",
    outcome: "Publishes to LinkedIn",
    description:
      "Writes a post with a real hook and a useful insight tied to what you do, then publishes it to your LinkedIn. In Ask mode it waits for your approval first; in Auto it just ships.",
    icon: Briefcase,
    category: "Social media",
    kind: "linkedin_post",
    schedule_cron: "0 8 * * 1",
    scheduleLabel: "Weekly, Mon 8am",
    channel: "dashboard",
    instructions:
      "Write one on-brand LinkedIn post for our company: a strong hook, a genuinely useful insight tied to what we do, and a clear takeaway. No hashtag spam, keep it human. Then publish it to LinkedIn.",
  },
  {
    id: "linkedin-draft",
    name: "LinkedIn Draft Writer",
    tagline: "A ready-to-post LinkedIn update, no account connection needed.",
    outcome: "Delivers a draft to copy",
    description:
      "Prefer to post yourself? This writes one polished LinkedIn update in your brand voice each week and leaves it on your dashboard to copy and paste. Nothing gets published for you.",
    icon: PenLine,
    category: "Social media",
    kind: "content",
    schedule_cron: "0 8 * * 1",
    scheduleLabel: "Weekly, Mon 8am",
    channel: "dashboard",
    instructions:
      "Draft one ready-to-post LinkedIn update in our brand voice: a scroll-stopping hook, a useful point grounded in what we do, and a light call to engagement. Deliver it as clean text I can copy and paste. Do not post it anywhere.",
  },
  {
    id: "reddit-poster",
    name: "Reddit Community Poster",
    tagline: "Posts genuinely useful content to Reddit, the safe way.",
    outcome: "Posts (you approve first)",
    description:
      "Reddit removes anything that reads as an ad, so this writes a value-first post (a real insight, resource, or story), checks the subreddit's rules first, and mentions you only where it's allowed. Every post waits for your approval before it goes live.",
    icon: MessageSquare,
    category: "Social media",
    kind: "reddit_post",
    schedule_cron: "0 9 * * 1",
    scheduleLabel: "Weekly, Mon 9am",
    channel: "dashboard",
    instructions:
      "Write one genuinely valuable Reddit post for a subreddit where our audience spends time. Lead with real substance (an insight, a useful resource, or an honest story) that stands on its own. Check the subreddit's rules with web search first, respect its self-promotion norms, and mention us only where it fits, with an honest disclosure. Then submit it. Never post something that reads as an ad.",
  },
  {
    id: "seo-blog-writer",
    name: "SEO Blog Writer",
    tagline: "A complete, publish-ready article for your site every week.",
    outcome: "Delivers a full article",
    description:
      "Picks a topic your customers are searching for and writes the whole piece: title, meta description, and a structured body, grounded in what you actually do. You publish it wherever you like.",
    icon: FileText,
    category: "SEO & content",
    kind: "seo_blog",
    schedule_cron: "0 7 * * 1",
    scheduleLabel: "Weekly, Mon 7am",
    channel: "dashboard",
    instructions:
      "Write one complete, publish-ready SEO article for our website on a topic our customers are actively searching for. Include a title, a meta description, and a well-structured body with headings. Ground every claim in what we actually do. Deliver the full article as the result.",
  },
  {
    id: "content-angles",
    name: "Content Angle Generator",
    tagline: "Five fresh, specific content ideas to run with each week.",
    outcome: "Delivers 5 ideas",
    description:
      "Never stare at a blank page again. Each week it brainstorms five concrete content angles tied to your audience's real problems and your positioning, with a one-line pitch for why each would land.",
    icon: Lightbulb,
    category: "SEO & content",
    kind: "content",
    schedule_cron: "0 8 * * 1",
    scheduleLabel: "Weekly, Mon 8am",
    channel: "dashboard",
    instructions:
      "Brainstorm 5 fresh, specific content ideas for us this week (posts, articles, or hooks), each tied to our audience's real problems and our positioning. For each, give a one-line angle and a sentence on why it would land. Keep them concrete and usable, never generic filler.",
  },
  {
    id: "competitor-watch",
    name: "Competitor Watch",
    tagline: "A weekly brief on what your competitors just changed.",
    outcome: "Emails you a brief",
    description:
      "Tracks your main competitors and emails you a short brief on what moved this week: messaging, pricing, launches, campaigns, plus any opening it creates for you. Uses live web search.",
    icon: Eye,
    category: "Leads & research",
    kind: "content",
    schedule_cron: "0 7 * * 1",
    scheduleLabel: "Weekly, Mon 7am",
    channel: "email",
    instructions:
      "Research our main competitors and summarize what changed this week: new messaging, pricing, product launches, campaigns, or notable posts. Use web search to check their sites and recent activity. Deliver a short brief with the 3 to 5 things most worth knowing and any opportunity each one opens for us.",
  },
];

/** Build the create-agent payload for a template. */
export function templateToProposal(t: AgentTemplate): AgentProposalInput {
  return {
    title: t.name,
    instructions: t.instructions,
    channel: t.channel,
    schedule_cron: t.schedule_cron,
    timezone: "UTC",
    kind: t.kind,
    keywords: [],
    subreddits: [],
    proposalId: t.id,
  };
}
