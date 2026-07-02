import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { env } from "@/env";
import { approvalKeys } from "@/features/approvals/queries";
import { autonomyKeys } from "@/features/autonomy/queries";
import { taskKeys } from "@/features/tasks/queries";
import { supabase } from "@/integrations/supabase/client";

export interface CreatedAgent {
  id: string;
  title: string;
}

export interface AgentProposal {
  id: string;
  title: string;
  instructions: string;
  channel: string;
  schedule_cron: string | null;
  timezone: string;
  kind: "content" | "reddit_monitor";
  keywords: string[];
  subreddits: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created?: CreatedAgent[];
  proposals?: AgentProposal[];
}

export interface ChatResponse {
  reply: string;
  created: CreatedAgent[];
  proposals: AgentProposal[];
}

export interface Attachment {
  id: string;
  name: string;
  kind: "image" | "document";
  mediaType: string;
  data: string; // base64, no data-url prefix
  url?: string; // client-only preview url for images
}

export type ChatRow = Pick<Tables<"chats">, "id" | "title" | "updated_at">;

export const chatKeys = {
  list: ["chats"] as const,
  messages: (id: string) => ["chat-messages", id] as const,
};

interface StreamEvent {
  type: "status" | "done" | "error";
  text?: string;
  reply?: string;
  created?: CreatedAgent[];
  proposals?: AgentProposal[];
  error?: string;
}

/**
 * Ask Flowy for a reply (and possibly spin up agents). Streams "what I'm doing"
 * status events (onStatus) while it works, then resolves with the final reply.
 * Uses fetch (not functions.invoke) so it can stream and be aborted.
 */
export async function sendChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  onStatus?: (text: string) => void,
  attachments?: Attachment[],
): Promise<ChatResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const files = (attachments ?? []).map((a) => ({
    kind: a.kind,
    mediaType: a.mediaType,
    data: a.data,
  }));
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, attachments: files }),
    signal,
  });

  // Non-streaming path (validation errors, or the "no AI key" fallback).
  if (!res.headers.get("content-type")?.includes("text/event-stream") || !res.body) {
    const data = (await res.json().catch(() => ({}))) as Partial<ChatResponse> & { error?: string };
    if (!res.ok || data.error) throw new Error(data.error ?? `Chat failed (${res.status})`);
    return { reply: data.reply ?? "Done.", created: data.created ?? [], proposals: [] };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result: ChatResponse | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      let evt: StreamEvent;
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "status" && evt.text) onStatus?.(evt.text);
      else if (evt.type === "done")
        result = {
          reply: evt.reply ?? "Done.",
          created: evt.created ?? [],
          proposals: evt.proposals ?? [],
        };
      else if (evt.type === "error") throw new Error(evt.error ?? "Chat failed");
    }
  }
  if (!result) throw new Error("No response from Flowy.");
  return result;
}

export function useChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      messages,
      signal,
      onStatus,
      attachments,
    }: {
      messages: { role: string; content: string }[];
      signal?: AbortSignal;
      onStatus?: (text: string) => void;
      attachments?: Attachment[];
    }) => sendChat(messages, signal, onStatus, attachments),
    // a created agent should show up in the list immediately; a chat turn may
    // also have queued an action for approval, so refresh those too.
    onSuccess: (data) => {
      if (data.created?.length) {
        void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      }
      void queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.pendingCount });
      void queryClient.invalidateQueries({ queryKey: autonomyKeys.mode });
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
    .select("role, content, created_agents, proposals")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    created: (m.created_agents as CreatedAgent[] | null) ?? undefined,
    proposals: (m.proposals as AgentProposal[] | null) ?? undefined,
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
    proposals: message.proposals ?? [],
  });
  if (error) throw error;
}

/** Bump a conversation to the top of the recent list. */
export async function touchChat(chatId: string): Promise<void> {
  await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
}

/** Rename a conversation. */
export async function renameChat(chatId: string, title: string): Promise<void> {
  const { error } = await supabase.from("chats").update({ title }).eq("id", chatId);
  if (error) throw error;
}

/** Delete a conversation (its messages cascade away). */
export async function deleteChat(chatId: string): Promise<void> {
  const { error } = await supabase.from("chats").delete().eq("id", chatId);
  if (error) throw error;
}

export function useRenameChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameChat(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.list }),
  });
}

export function useDeleteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteChat(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.list }),
  });
}
