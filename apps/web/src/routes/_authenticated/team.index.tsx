import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/features/dashboard/ui";
import { TeamCards } from "@/features/employees/TeamCards";
import { useWorkspace } from "@/features/workspace/hooks";

export const Route = createFileRoute("/_authenticated/team/")({
  component: TeamPage,
});

/** All the AI employees: who's working, who needs setup, who you can hire. */
function TeamPage() {
  const { data: ws } = useWorkspace();
  const company = ws?.name && ws.name !== "My team" ? ws.name : "your business";

  return (
    <div className="flowy-page">
      <PageHeader
        title="Your team"
        subtitle={`Employees own agents and report on their area. Every agent working for ${company} lives on the Agents page too.`}
      />
      <TeamCards />
    </div>
  );
}
