import type { Task } from "@/features/tasks/queries";
import { AGENT_TEMPLATES, type AgentTemplate } from "@/features/tasks/templates";

/**
 * The employee layer. Every agent (task) belongs to one employee. Roles mirror
 * the template library's real capability areas, so every hireable employee is
 * backed by skills that actually work today: no vaporware personas.
 */
export type EmployeeRole = "growth" | "social" | "content" | "support" | "sales" | "analyst";

export interface EmployeeMeta {
  role: EmployeeRole;
  /** The employee's given name ("Maya"): a hire, not a feature. */
  name: string;
  /** Their avatar emoji, shown in a tinted tile. */
  emoji: string;
  /** Tailwind classes tinting the avatar tile. */
  tint: string;
  /** Display name of the role ("Growth Marketer"), the employee's job title. */
  title: string;
  /** What this employee does, in one line a new user instantly gets. */
  blurb: string;
  /** What hiring it actually sets up, shown on the hire card. */
  hirePitch: string;
  /** Integrations this employee can work through, shown on their Settings tab. */
  relevantToolkits: string[];
  /** One line selling that this hire arrives pre-briefed, shown on candidate cards. */
  trainedLine: string;
  /** Template ids this employee starts with when hired. */
  starterTemplates: string[];
  /** On the roster but not hireable yet; sells the roadmap honestly. */
  comingSoon?: boolean;
}

export const EMPLOYEES: EmployeeMeta[] = [
  {
    role: "growth",
    name: "Maya",
    emoji: "🚀",
    tint: "bg-[#eef4fd] text-[#1566e6]",
    title: "Growth Marketer",
    blurb: "Finds the people already looking for you.",
    hirePitch:
      "Watches Reddit for buyer-intent posts in your space and drafts natural replies, and keeps an eye on your competitors. You approve everything.",
    relevantToolkits: ["reddit"],
    trainedLine: "Pre-trained on your website: she knows what you sell and who buys it.",
    starterTemplates: ["reddit-lead-finder", "competitor-watch"],
  },
  {
    role: "social",
    name: "Nova",
    emoji: "📣",
    tint: "bg-pink-50 text-pink-600",
    title: "Social Media Manager",
    blurb: "Keeps your socials alive with on-brand posts.",
    hirePitch:
      "Writes and schedules posts for LinkedIn, Reddit, Facebook, and TikTok slideshows, in your voice, on a steady cadence you set once.",
    relevantToolkits: ["linkedin", "facebook", "reddit"],
    trainedLine: "Pre-trained on your website: posts sound like you from day one.",
    starterTemplates: ["linkedin-poster", "reddit-poster"],
  },
  {
    role: "content",
    name: "Alex",
    emoji: "✍️",
    tint: "bg-amber-50 text-amber-700",
    title: "Content Writer",
    blurb: "Writes SEO articles straight to your blog.",
    hirePitch:
      "Publishes a complete, search-optimized article to your blog every week (WordPress or any custom site), plus fresh content angles when you need them.",
    relevantToolkits: ["wordpress", "webhook"],
    trainedLine: "Pre-trained on your website: he writes about what you actually do.",
    starterTemplates: ["seo-blog-writer", "content-angles"],
  },
  {
    role: "support",
    name: "Sam",
    emoji: "🎧",
    tint: "bg-emerald-50 text-emerald-600",
    title: "Customer Support",
    blurb: "Answers your inbox with on-brand replies.",
    hirePitch:
      "Reads incoming Gmail and Messenger and drafts replies in your voice for you to approve, so no customer waits on you being busy.",
    relevantToolkits: ["gmail", "facebook", "slack"],
    trainedLine: "Pre-trained on your website: he answers in your product's voice.",
    starterTemplates: ["email-responder"],
  },
  {
    role: "sales",
    name: "Riley",
    emoji: "📞",
    tint: "bg-violet-50 text-violet-600",
    title: "Sales Development",
    blurb: "Finds prospects and drafts your outreach.",
    hirePitch:
      "Researches companies that match your ideal customer and drafts personalized outreach for your approval.",
    relevantToolkits: ["gmail", "linkedin"],
    trainedLine: "In training. Joins the roster soon.",
    starterTemplates: [],
    comingSoon: true,
  },
  {
    role: "analyst",
    name: "Quinn",
    emoji: "📊",
    tint: "bg-sky-50 text-sky-600",
    title: "Data Analyst",
    blurb: "Turns your numbers into a weekly report.",
    hirePitch:
      "Pulls your marketing results together every week and tells you what changed and what to double down on.",
    relevantToolkits: ["googleads", "hubspot", "notion"],
    trainedLine: "In training. Joins the roster soon.",
    starterTemplates: [],
    comingSoon: true,
  },
];

/** Roles a user can actually hire today (routable employee pages). */
export const HIREABLE_ROLES = EMPLOYEES.filter((e) => !e.comingSoon).map((e) => e.role);

const CATEGORY_ROLE: Record<string, EmployeeRole> = {
  "Leads & research": "growth",
  "Social media": "social",
  "SEO & content": "content",
  "Inbox & replies": "support",
};

const KIND_ROLE: Record<string, EmployeeRole> = {
  reddit_monitor: "growth",
  reddit_post: "social",
  linkedin_post: "social",
  facebook_post: "social",
  tiktok_slideshow: "social",
  seo_blog: "content",
  content: "content",
  email_responder: "support",
  facebook_dm: "support",
};

const TEMPLATE_BY_ID = new Map(AGENT_TEMPLATES.map((t) => [t.id, t]));

/**
 * Which employee a live agent belongs to. Agents created from a template keep
 * its category's role (that's what disambiguates the generic "content" kind);
 * everything else maps by kind, and unknown/custom kinds land with Maya so
 * nothing ever falls off the team page.
 */
export function roleOfTask(task: Pick<Task, "kind" | "config">): EmployeeRole {
  const pid = (task.config as { proposal_id?: string } | null)?.proposal_id;
  const template = pid ? TEMPLATE_BY_ID.get(pid) : undefined;
  if (template) return CATEGORY_ROLE[template.category] ?? "growth";
  return KIND_ROLE[task.kind ?? ""] ?? "growth";
}

export function tasksOfRole<T extends Pick<Task, "kind" | "config">>(
  tasks: T[],
  role: EmployeeRole,
): T[] {
  return tasks.filter((t) => roleOfTask(t) === role);
}

export function employeeMeta(role: EmployeeRole): EmployeeMeta {
  return EMPLOYEES.find((e) => e.role === role) ?? EMPLOYEES[0];
}

/** The skill library, per employee: the templates whose category is this role's. */
export function templatesOfRole(role: EmployeeRole): AgentTemplate[] {
  return AGENT_TEMPLATES.filter((t) => (CATEGORY_ROLE[t.category] ?? "growth") === role);
}

/** The skills a role starts with when hired. */
export function starterTemplatesOf(meta: EmployeeMeta): AgentTemplate[] {
  return meta.starterTemplates
    .map((id) => TEMPLATE_BY_ID.get(id))
    .filter((t): t is AgentTemplate => !!t);
}

// What one run of each kind actually does, in plain shift-plan language.
const KIND_LINE: Record<string, string> = {
  reddit_monitor: "Scans Reddit for new leads and drafts replies",
  reddit_post: "Writes and queues community posts",
  linkedin_post: "Drafts LinkedIn posts",
  facebook_post: "Drafts Facebook posts",
  tiktok_slideshow: "Builds TikTok slideshows",
  seo_blog: "Writes complete SEO articles",
  content: "Drafts content from fresh research",
  email_responder: "Sweeps the inbox and drafts replies",
  facebook_dm: "Answers Messenger conversations",
};

export function kindLine(kind: string | null | undefined): string {
  return KIND_LINE[kind ?? ""] ?? "Runs its instructions";
}
