import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { taskKeys } from "@/features/tasks/queries";
import { supabase } from "@/integrations/supabase/client";

export interface CreatedAgent {
  id: string;
  title: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created?: CreatedAgent[];
}

export interface ChatResponse {
  reply: string;
  created: CreatedAgent[];
}

export type ChatRow = Pick<Tables<"chats">, "id" | "title" | "updated_at">;

export const chatKeys = {
  list: ["chats"] as const,
  messages: (id: string) => ["chat-messages", id] as const,
};

/** Ask Flowy for a reply (and possibly spin up agents). Stateless AI call. */
export async function sendChat(
  messages: { role: string; content: string }[],
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke("chat", { body: { messages } });
  if (error) throw error;
  return data as ChatResponse;
}

export function useChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendChat,
    // a created agent should show up in the list immediately
    onSuccess: (data) => {
      if (data.created?.length) {
        void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      }
    },
  });
}

// ---------------- conversation persistence ----------------

/** The user's recent conversations, newest first (RLS scopes to their team). */
export const chatsQueryOptions = queryOptions({
  queryKey: chatKeys.list,
  queryFn: async (): Promise<ChatRow[]> => {
    const { data, error } = await supabase
      .from("chats")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  },
});

export function useChats() {
  return useQuery(chatsQueryOptions);
}

/** Load a single conversation's messages, oldest first. */
export async function fetchChatMessages(chatId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, created_agents")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    created: (m.created_agents as CreatedAgent[] | null) ?? undefined,
  }));
}

/** Create a new conversation titled from the first message. */
export async function createChat(teamId: string, firstMessage: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const title = firstMessage.trim().slice(0, 60) || "New chat";
  const { data, error } = await supabase
    .from("chats")
    .insert({ team_id: teamId, created_by: user.id, title })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Persist one message in a conversation. */
export async function saveMessage(
  chatId: string,
  teamId: string,
  message: ChatMessage,
): Promise<void> {
  const { error } = await supabase.from("chat_messages").insert({
    chat_id: chatId,
    team_id: teamId,
    role: message.role,
    content: message.content,
    created_agents: message.created ?? [],
  });
  if (error) throw error;
}

/** Bump a conversation to the top of the recent list. */
export async function touchChat(chatId: string): Promise<void> {
  await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
}
