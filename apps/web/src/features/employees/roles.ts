import type { Task } from "@/features/tasks/queries";

/**
 * The employee layer. Every agent (task) belongs to one employee, derived from
 * its kind, no schema needed: all current marketing kinds roll up under the
 * Marketing employee, inbox-answering kinds under Customer Support. Unknown
 * kinds default to Marketing so nothing ever falls off the team page.
 */
export type EmployeeRole = "marketing" | "support";

export interface EmployeeMeta {
  role: EmployeeRole;
  /** Display name of the role ("Marketing"), used as the employee's title. */
  title: string;
  /** What this employee does, in one line a new user instantly gets. */
  blurb: string;
  /** What hiring it actually sets up, shown on the hire card. */
  hirePitch: string;
}

export const EMPLOYEES: EmployeeMeta[] = [
  {
    role: "marketing",
    title: "Marketing",
    blurb: "Finds leads, writes content, and posts for you.",
    hirePitch:
      "Watches Reddit for buyers, writes SEO articles for your blog, and drafts posts. It reads your website and proposes its own work plan.",
  },
  {
    role: "support",
    title: "Customer Support",
    blurb: "Answers your inbox with on-brand replies.",
    hirePitch:
      "Reads incoming Gmail and drafts replies in your voice for you to approve, so no customer waits on you being busy.",
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
