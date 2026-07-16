import type { Task } from "@/features/tasks/queries";
import { AGENT_TEMPLATES, type AgentTemplate } from "@/features/tasks/templates";

/**
 * The employee layer. Every agent (task) belongs to one employee, derived from
 * its kind, no schema needed: all current marketing kinds roll up under the
 * Marketing employee, inbox-answering kinds under Customer Support. Unknown
 * kinds default to Marketing so nothing ever falls off the team page.
 */
export type EmployeeRole = "marketing" | "support" | "sales";

export interface EmployeeMeta {
  role: EmployeeRole;
  /** The employee's given name ("Maya"): a hire, not a feature. */
  name: string;
  /** Their avatar emoji, shown in a tinted tile. */
  emoji: string;
  /** Tailwind classes tinting the avatar tile. */
  tint: string;
  /** Display name of the role ("Marketing"), the employee's job title. */
  title: string;
  /** What this employee does, in one line a new user instantly gets. */
  blurb: string;
  /** What hiring it actually sets up, shown on the hire card. */
  hirePitch: string;
  /** Integrations this employee can work through, shown on their Settings tab. */
  relevantToolkits: string[];
  /** One line selling that this hire arrives pre-briefed, shown on candidate cards. */
  trainedLine: string;
  /** On the roster but not hireable yet; sells the roadmap honestly. */
  comingSoon?: boolean;
}

export const EMPLOYEES: EmployeeMeta[] = [
  {
    role: "marketing",
    name: "Maya",
    emoji: "🚀",
    tint: "bg-[#eef4fd] text-[#1566e6]",
    title: "Marketing",
    blurb: "Finds leads, writes content, and posts for you.",
    hirePitch:
      "Watches Reddit for buyers, writes SEO articles for your blog, and drafts posts. She reads your website and proposes her own work plan.",
    relevantToolkits: ["reddit", "linkedin", "facebook", "wordpress", "webhook"],
    trainedLine: "Pre-trained on your website: her work plan is already drafted.",
  },
  {
    role: "support",
    name: "Sam",
    emoji: "🎧",
    tint: "bg-emerald-50 text-emerald-600",
    title: "Customer Support",
    blurb: "Answers your inbox with on-brand replies.",
    hirePitch:
      "Reads incoming Gmail and drafts replies in your voice for you to approve, so no customer waits on you being busy.",
    relevantToolkits: ["gmail", "slack"],
    trainedLine: "Pre-trained on your website: he answers in your product's voice.",
  },
  {
    role: "sales",
    name: "Riley",
    emoji: "📞",
    tint: "bg-violet-50 text-violet-600",
    title: "Sales",
    blurb: "Finds prospects and drafts your outreach.",
    hirePitch:
      "Researches companies that match your ideal customer and drafts personalized outreach for your approval.",
    relevantToolkits: ["gmail", "linkedin"],
    trainedLine: "In training. Joins the roster soon.",
    comingSoon: true,
  },
];

const SUPPORT_KINDS = new Set(["email_responder", "facebook_dm"]);

export function roleOfTask(task: Pick<Task, "kind">): EmployeeRole {
  return SUPPORT_KINDS.has(task.kind ?? "") ? "support" : "marketing";
}

export function tasksOfRole<T extends Pick<Task, "kind">>(tasks: T[], role: EmployeeRole): T[] {
  return tasks.filter((t) => roleOfTask(t) === role);
}

export function employeeMeta(role: EmployeeRole): EmployeeMeta {
  return EMPLOYEES.find((e) => e.role === role) ?? EMPLOYEES[0];
}

/**
 * The skill library, per employee: the ready-made templates this role can take
 * on. Same kind→role mapping as live agents, so a template always lands under
 * the employee whose page offered it.
 */
export function templatesOfRole(role: EmployeeRole): AgentTemplate[] {
  return AGENT_TEMPLATES.filter((t) => roleOfTask({ kind: t.kind }) === role);
}
