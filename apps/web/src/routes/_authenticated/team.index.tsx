import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/features/dashboard/ui";
import { useCustomAgents } from "@/features/employees/customAgents";
import { EMPLOYEES, tasksOfRole } from "@/features/employees/roles";
import { TeamCards } from "@/features/employees/TeamCards";
import { useTasks } from "@/features/tasks/hooks";

export const Route = createFileRoute("/_authenticated/team/")({
  component: TeamPage,
});

/** All the AI employees: who's working, who needs setup, who you can hire. */
function TeamPage() {
  const { data: tasks } = useTasks();
  const { data: customs } = useCustomAgents();

  // Nobody hired yet: don't call a page of candidates "your team".
  const customIds = new Set((customs ?? []).map((c) => c.id));
  const hasTeam =
    (customs ?? []).length > 0 ||
    EMPLOYEES.some((e) => tasksOfRole(tasks ?? [], e.role, customIds).length > 0);

  return (
    <div className="flowy-page">
      <PageHeader
        title={hasTeam ? "Your team" : "Hire your first employee"}
        subtitle={
          hasTeam
            ? "An employee manages a group of your agents: one chat, one report, one place to check instead of opening each agent."
            : "Nobody works for you yet. An employee manages a group of agents, reports what got done, and answers for it in chat, so you check one desk instead of every agent."
        }
      />
      <TeamCards />
    </div>
  );
}
