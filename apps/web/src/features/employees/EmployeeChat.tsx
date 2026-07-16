import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { Chat } from "@/features/chat/Chat";
import { chatKeys, createChat, useChats } from "@/features/chat/hooks";
import { useActiveTeamId } from "@/features/workspace/active";

import type { EmployeeMeta } from "./roles";

/**
 * The employee's direct line: one persistent conversation per employee (found
 * by title, created on first open), rendered exactly like the main chat page,
 * just addressed to them. It's the normal Sentrive chat underneath, so
 * assigning work here creates real agents.
 */
export function EmployeeChat({ meta }: { meta: EmployeeMeta }) {
  const teamId = useActiveTeamId();
  const { data: chats, isLoading } = useChats();
  const queryClient = useQueryClient();
  const creating = useRef(false);

  const title = `Chat with ${meta.name}`;
  const existing = chats?.find((c) => c.title === title);

  useEffect(() => {
    if (isLoading || existing || !teamId || creating.current) return;
    creating.current = true;
    void createChat(teamId, title)
      .then(() => queryClient.invalidateQueries({ queryKey: chatKeys.list }))
      .catch(() => {
        creating.current = false; // let a retry happen on next render
      });
  }, [isLoading, existing, teamId, title, queryClient]);

  return (
    <div className="h-[calc(100vh-250px)] min-h-[520px]">
      {existing ? (
        <Chat
          chatId={existing.id}
          embedded
          placeholder={`Tell ${meta.name} what you need…  e.g. “write an article about our new feature” or “watch r/startups too”`}
          emptyHero={
            <div className="mb-8 text-center">
              <span
                className={`mx-auto mb-4 grid size-16 place-items-center rounded-2xl text-4xl shadow-xs ${meta.tint}`}
              >
                {meta.emoji}
              </span>
              <h2 className="text-3xl font-bold tracking-tight">Chat with {meta.name}</h2>
              <p className="text-muted-foreground mt-2 text-[15px]">
                Assign work, ask what got done, or change how things run.
              </p>
            </div>
          }
        />
      ) : (
        <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Opening your chat with {meta.name}…
        </div>
      )}
    </div>
  );
}
