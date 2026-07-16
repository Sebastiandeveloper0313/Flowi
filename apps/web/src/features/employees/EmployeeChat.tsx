import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { Chat } from "@/features/chat/Chat";
import { chatKeys, createChat, useChats } from "@/features/chat/hooks";
import { useActiveTeamId } from "@/features/workspace/active";

import type { EmployeeMeta } from "./roles";

/**
 * The employee's direct line: one persistent conversation per employee (found
 * by title, created on first open), so talking to Maya always resumes where it
 * left off. It's the normal Sentrive chat underneath, which means assigning
 * work here creates real agents, exactly like the main chat.
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
    <div className="bg-card h-[66vh] overflow-hidden rounded-2xl border p-3 shadow-xs">
      {existing ? (
        <Chat chatId={existing.id} embedded />
      ) : (
        <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Opening your chat with {meta.name}…
        </div>
      )}
    </div>
  );
}
