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
        title="Your team"
        subtitle={
          hasTeam
            ? "Each employee gives you one view across the agents they manage: everything they got done, in one chat and one report."
            : "Employees you hire show up here. Each one manages a group of agents and reports what got done."
        }
      />
      <TeamCards />
    </div>
  );
}
