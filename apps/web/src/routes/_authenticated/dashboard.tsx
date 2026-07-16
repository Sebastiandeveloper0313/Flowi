import { createFileRoute } from "@tanstack/react-router";

import { WaitingStrip } from "@/features/approvals/WaitingStrip";
import { Chat } from "@/features/chat/Chat";
import { AgentsGrid } from "@/features/tasks/AgentsGrid";
import { SuggestedAgents } from "@/features/tasks/SuggestedAgents";
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
          <WaitingStrip />
          <SuggestedAgents />
          <AgentsGrid />
        </section>
      )}
    </div>
  );
}
