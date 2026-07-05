import { createFileRoute } from "@tanstack/react-router";

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

  // Keep <Chat /> mounted across the landing <-> conversation switch: the wrapper
  // is stable and Chat decides its own layout (centered landing vs full-height
  // conversation). Remounting it here would drop the just-sent message.
  return (
    <div className="px-6 lg:px-12">
      <div className="mx-auto w-full max-w-3xl">
        <Chat chatId={c} />
      </div>
      {!inConversation && (
        <section className="mx-auto w-full max-w-5xl pb-20">
          <WelcomeTour />
          <SuggestedAgents />
          <AgentsGrid />
        </section>
      )}
    </div>
  );
}
