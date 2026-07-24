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
    <section id="your-team" className="mt-14">
      <div className="mb-6 text-center">
        {/* Nothing running yet: the dashboard shows what the library offers,
            led by the hire we'd actually recommend for this business. */}
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Ready-made employees
        </p>
        <h2 className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.02em]">
          Assemble your starter team
        </h2>
        <p className="text-muted-foreground mx-auto mt-1.5 max-w-lg text-sm">
          Hire a proven role in seconds. Not sure? Start with {suggested.name}: {pick.reason}
        </p>
      </div>
      <TeamCards variant="catalog" />
      <div className="mt-6 text-center">
        <Link to="/library" className="text-primary text-sm font-medium hover:underline">
          Browse the full library →
        </Link>
      </div>
    </section>
  );
}
