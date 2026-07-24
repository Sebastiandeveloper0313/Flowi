import type { Task } from "@/features/tasks/queries";
import { AGENT_TEMPLATES, type AgentTemplate } from "@/features/tasks/templates";

/**
 * The agent layer. Every task (skill) belongs to one named agent. Roles mirror
 * the template library's real capability areas, so every ready-made agent is
 * backed by skills that actually work today: no vaporware personas. The
 * "employee" naming in identifiers is historical; user-facing copy says agent.
 */
export type EmployeeRole = "growth" | "social" | "content" | "support" | "sales" | "analyst";

export interface EmployeeMeta {
  role: EmployeeRole;
  /** The employee's given name ("Maya"): a hire, not a feature. */
  name: string;
  /** Their avatar emoji, the fallback when no character image exists yet. */
  emoji: string;
  /** Their character portrait (public path); falls back to the emoji tile. */
  avatar?: string;
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
  /** User-created agent (a team_agents row); role holds its id. */
  custom?: boolean;
}

export const EMPLOYEES: EmployeeMeta[] = [
  {
    role: "growth",
    name: "Maya",
    emoji: "🚀",
    avatar: "/employees/maya.png",
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
    avatar: "/employees/nova.png",
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
    avatar: "/employees/alex.png",
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
    avatar: "/employees/sam.png",
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
    avatar: "/employees/riley.png",
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
    avatar: "/employees/quinn.png",
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

/**
 * Any roster address: a built-in role slug ("growth") or a custom agent's row
 * id. Custom agents are addressed by uuid everywhere a built-in uses its slug
 * (routes, config.role, document shelves).
 */
export type RosterRole = EmployeeRole | (string & {});

const CATEGORY_ROLE: Record<string, EmployeeRole> = {
  "Leads & research": "growth",
  "Social media": "social",
  "SEO & content": "content",
  "Inbox & replies": "support",
};

/** What kind of work belongs to which employee, when nothing else says. */
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
/**
 * Who OWNS this agent, or null when it runs independently. Ownership is
 * explicit (config.role, stamped by hire flows, employee chats, and the main
 * chat's pick): an agent nobody claimed is a first-class Independent agent,
 * not force-sorted onto someone's desk. Legacy tasks created before the
 * ownership stamp keep their old derived owner so nothing moves on upgrade.
 */
export function roleOfTask(
  task: Pick<Task, "kind" | "config">,
  customIds?: Set<string>,
): RosterRole {
  const cfg = task.config as { role?: string; proposal_id?: string } | null;
  if (
    cfg?.role &&
    (HIREABLE_ROLES.includes(cfg.role as EmployeeRole) || customIds?.has(cfg.role))
  ) {
    return cfg.role;
  }
  // Every agent belongs to someone: the product has one visible layer, so
  // nothing is ever orphaned. Templates sort by category, everything else by
  // what the work is, and anything unrecognised lands with the growth hire.
  const template = cfg?.proposal_id ? TEMPLATE_BY_ID.get(cfg.proposal_id) : undefined;
  if (template) return CATEGORY_ROLE[template.category] ?? "growth";
  return KIND_ROLE[task.kind ?? ""] ?? "growth";
}

export function tasksOfRole<T extends Pick<Task, "kind" | "config">>(
  tasks: T[],
  role: RosterRole,
  customIds?: Set<string>,
): T[] {
  return tasks.filter((t) => roleOfTask(t, customIds) === role);
}

/**
 * Who to start with, read from the business profile instead of a hardcoded
 * favourite. Deliberately simple and honest: a handful of signals, a stated
 * reason the user can judge, and Maya as the default when nothing matches
 * (finding buyers is the fastest first win for most businesses).
 */
export function recommendEmployee(ws: {
  business_model?: string | null;
  business_categories?: string[] | null;
  business_context?: unknown;
}): { role: EmployeeRole; reason: string } {
  const bc = (ws.business_context ?? {}) as Record<string, unknown>;
  const text = [
    ws.business_model,
    ...(ws.business_categories ?? []),
    typeof bc.summary === "string" ? bc.summary : "",
    typeof bc.audience === "string" ? bc.audience : "",
    typeof bc.product === "string" ? bc.product : "",
    Array.isArray(bc.keywords) ? (bc.keywords as string[]).join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Whole words only: "store" must not match "restore", "app" must not match
  // "happy". Loose matching sent a marketing SaaS to the social manager.
  const has = (...words: string[]) =>
    words.some((w) =>
      new RegExp(`(^|[^a-z])${w.replace(/[-.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(text),
    );

  // Software and services sell by finding people with the problem, so the
  // lead finder is the first hire even though they also need content later.
  if (has("saas", "software", "b2b", "app", "platform", "agency", "consulting", "startup")) {
    return {
      role: "growth",
      reason:
        "You sell to people who are already describing your problem online, so Maya finding those conversations and drafting replies is the fastest first win.",
    };
  }

  // Shops and local businesses live or die on presence, not on forum replies.
  if (has("ecommerce", "e-commerce", "shopify", "store", "retail", "boutique", "apparel")) {
    return {
      role: "social",
      reason:
        "For a store, steady on-brand posts do more than anything else, and Nova writes and schedules them in your voice.",
    };
  }
  if (has("restaurant", "salon", "clinic", "dentist", "gym", "local", "plumber", "contractor")) {
    return {
      role: "social",
      reason:
        "For a local business, showing up consistently on social is the cheapest way to stay top of mind, and that is Nova's whole job.",
    };
  }
  // Content-led businesses (courses, media, blogs) compound through search.
  if (has("blog", "media", "publisher", "course", "newsletter", "content site", "seo")) {
    return {
      role: "content",
      reason:
        "Your growth compounds through search, so Alex writing a complete SEO article to your blog every week is the highest-leverage start.",
    };
  }
  // Heavy inbound support load: the inbox is the bottleneck.
  if (has("support", "helpdesk", "marketplace", "customers write", "tickets")) {
    return {
      role: "support",
      reason:
        "Your inbox is where customers wait on you, so Sam drafting replies in your voice buys back the most time first.",
    };
  }
  return {
    role: "growth",
    reason:
      "She finds people already asking for what you sell and drafts replies for you to approve, which is the fastest path to a first customer.",
  };
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
