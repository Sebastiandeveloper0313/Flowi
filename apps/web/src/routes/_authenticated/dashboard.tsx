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
    <section>
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Your team</h2>
          {!hasStaff && (
            <p className="text-muted-foreground mt-1 text-sm">
              Pre-briefed on your business. Hire one and it starts today.
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
