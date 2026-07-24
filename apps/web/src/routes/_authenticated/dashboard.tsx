import { createFileRoute, Link } from "@tanstack/react-router";

import { Chat } from "@/features/chat/Chat";
import { Workplace } from "@/features/dashboard/Workplace";
import { employeeMeta, recommendEmployee } from "@/features/employees/roles";
import { TeamCards } from "@/features/employees/TeamCards";
import { useTasks } from "@/features/tasks/hooks";
import { WelcomeTour } from "@/features/tasks/WelcomeTour";
import { useWorkspace } from "@/features/workspace/hooks";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>): { c?: string } => ({
    c: typeof search.c === "string" ? search.c : undefined,
  }),
  component: ChatPage,
});

function ChatPage() {
  const { c } = Route.useSearch();
  const inConversation = Boolean(c);

  // Keep <Chat /> mounted across the landing <-> conversation switch: only the
  // wrapper classes change, Chat is never remounted, so a just-sent message
  // survives. In a conversation, drop the centered max-width so Chat spans the
  // full width and its scrollbar sits at the window's right edge (it still
  // centers its own message column). On the landing, keep it centered.
  return (
    <div className={inConversation ? undefined : "px-6 lg:px-12"}>
      <div className={inConversation ? "w-full" : "mx-auto w-full max-w-3xl"}>
        <Chat chatId={c} />
      </div>
      {!inConversation && (
        <section className="mx-auto w-full max-w-3xl pb-20">
          <WelcomeTour />
          {/* The workplace: everything every agent did, and everything that
              needs you, right under the composer. TeamSection only shows for
              a workspace with nothing running yet (the start-here catalog). */}
          <Workplace />
          <TeamSection />
        </section>
      )}
    </div>
  );
}

/**
 * The team, under the chat: everyone working for you, everyone you can hire,
 * and who's joining the roster next. Always visible so the product reads as a
 * team you're building, never a single lonely agent.
 */
function TeamSection() {
  const { data: tasks, isLoading } = useTasks();
  const { data: ws } = useWorkspace();
  if (isLoading) return null;
  const hasStaff = (tasks ?? []).length > 0;
  // With work running, the Workplace above IS the page; no roster grid here.
  if (hasStaff) return null;

  // Pick the first hire from what we learned about their business, and say why.
  const pick = recommendEmployee(ws ?? {});
  const suggested = employeeMeta(pick.role);

  return (
    <section id="your-team">
      <header className="mb-5 flex items-end justify-between">
        <div>
          {/* Nothing running yet: the dashboard shows what the library offers,
              led by the hire we'd actually recommend for this business. */}
          <h2 className="text-2xl font-bold tracking-tight">
            {hasStaff ? "Your team" : "Start here"}
          </h2>
          {!hasStaff && (
            <p className="text-muted-foreground mt-1 max-w-xl text-sm">
              Not sure? Hire {suggested.name}. {pick.reason} Anything else: just type it in the box
              above.
            </p>
          )}
        </div>
        <Link
          to={hasStaff ? "/team" : "/library"}
          className="text-primary text-sm font-medium hover:underline"
        >
          {hasStaff ? "See all" : "Browse the library"}
        </Link>
      </header>
      <TeamCards variant={hasStaff ? "team" : "catalog"} />
    </section>
  );
}
