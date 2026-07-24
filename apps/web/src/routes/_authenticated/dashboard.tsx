import { createFileRoute, Link } from "@tanstack/react-router";

import { Chat } from "@/features/chat/Chat";
import { TeamCards } from "@/features/employees/TeamCards";
import { useTasks } from "@/features/tasks/hooks";
import { WelcomeTour } from "@/features/tasks/WelcomeTour";

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
        <section className="mx-auto w-full max-w-5xl pb-20">
          <WelcomeTour />
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
  if (isLoading) return null;
  const hasStaff = (tasks ?? []).length > 0;

  return (
    <section id="your-team">
      <header className="mb-5 flex items-end justify-between">
        <div>
          {/* Nothing running yet: name the two ways to start, in order, so a
              brand-new user always has one obvious next click. */}
          <h2 className="text-2xl font-bold tracking-tight">
            {hasStaff ? "Your team" : "Start here"}
          </h2>
          {!hasStaff && (
            <p className="text-muted-foreground mt-1 max-w-xl text-sm">
              Hire an employee below and they start today with their agents already set up, or type
              what you need in the box above and Sentrive builds it for you.
            </p>
          )}
        </div>
        <Link to="/team" className="text-primary text-sm font-medium hover:underline">
          See all
        </Link>
      </header>
      <TeamCards />
    </section>
  );
}
