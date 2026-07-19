import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

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
        subtitle={`The AI employees working for ${company}. Open one to see their work, or hire for a role.`}
        actions={
          <Link
            to="/brain"
            className="text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 text-sm font-medium"
          >
            <BookOpen className="size-4" /> What they know
          </Link>
        }
      />
      <TeamCards />
    </div>
  );
}
