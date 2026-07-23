import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { env } from "@/env";
import { approvalKeys } from "@/features/approvals/queries";
import { autonomyKeys } from "@/features/autonomy/queries";
import { taskKeys } from "@/features/tasks/queries";
import { useActiveTeamId } from "@/features/workspace/active";
import { workspaceKeys } from "@/features/workspace/queries";
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
  kind:
    | "content"
    | "reddit_monitor"
    | "linkedin_post"
    | "seo_blog"
    | "reddit_post"
    | "facebook_post"
    | "facebook_dm"
    | "email_responder"
    | "tiktok_slideshow";
  keywords: string[];
  subreddits: string[];
  /** Roster owner the chat picked: built-in slug or a custom agent's id. */
  role?: string;
}

/** A proposed change to an existing agent, confirmed on a card. */
export interface AgentUpdate {
  id: string;
  agentId: string;
  title: string;
  kind:
    | "content"
    | "reddit_monitor"
    | "linkedin_post"
    | "seo_blog"
    | "reddit_post"
    | "facebook_post"
    | "facebook_dm"
    | "email_responder"
    | "tiktok_slideshow";
  changes: {
    title?: string;
    instructions?: string;
    schedule_cron?: string | null;
    channel?: string;
    keywords?: string[];
    subreddits?: string[];
  };
}

/** A brand-new roster agent plus its first skill, confirmed on a card. */
export interface NewAgentProposal {
  id: string;
  name: string;
  emoji: string;
  agentTitle: string;
  skill: Omit<AgentProposal, "id" | "role">;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created?: CreatedAgent[];
  proposals?: AgentProposal[];
  newAgents?: NewAgentProposal[];
  updates?: AgentUpdate[];
}

export interface ChatResponse {
  reply: string;
  created: CreatedAgent[];
  proposals: AgentProposal[];
  newAgents: NewAgentProposal[];
  updates: AgentUpdate[];
  /** True when the turn re-analyzed the website and updated the business context. */
  contextUpdated: boolean;
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
  newAgents?: NewAgentProposal[];
  updates?: AgentUpdate[];
  contextUpdated?: boolean;
  error?: string;
}

/**
 * Ask Sentrive for a reply (and possibly spin up agents). Streams "what I'm doing"
 * status events (onStatus) while it works, then resolves with the final reply.
 * Uses fetch (not functions.invoke) so it can stream and be aborted.
 */
export async function sendChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  onStatus?: (text: string) => void,
  attachments?: Attachment[],
  teamId?: string | null,
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
    body: JSON.stringify({ messages, attachments: files, team_id: teamId ?? undefined }),
    signal,
  });

  // Non-streaming path (validation errors, or the "no AI key" fallback).
  if (!res.headers.get("content-type")?.includes("text/event-stream") || !res.body) {
    const raw = await res.text().catch(() => "");
    const data = (() => {
      try {
        return JSON.parse(raw) as Partial<ChatResponse> & { error?: string };
      } catch {
        return {} as Partial<ChatResponse> & { error?: string };
      }
    })();
    if (!res.ok || data.error) {
      // 5xx here is the platform (function crashed, worker limits, upstream AI
      // outage), not the user's message. Say so honestly, and keep the raw body
      // in the error so a screenshot tells us exactly what happened.
      const detail = data.error ?? (raw ? raw.slice(0, 160) : "");
      throw new Error(
        res.status >= 500
          ? `Sentrive had a hiccup (${res.status}${detail ? `: ${detail}` : ""}). Your message wasn't lost, try sending it again.`
          : (data.error ?? `Chat failed (${res.status}${detail ? `: ${detail}` : ""})`),
      );
    }
    return {
      reply: data.reply ?? "Done.",
      created: data.created ?? [],
      proposals: [],
      newAgents: [],
      updates: [],
      contextUpdated: false,
    };
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
          newAgents: evt.newAgents ?? [],
          updates: evt.updates ?? [],
          contextUpdated: evt.contextUpdated ?? false,
        };
      else if (evt.type === "error") throw new Error(evt.error ?? "Chat failed");
    }
  }
  if (!result) throw new Error("No response from Sentrive.");
  return result;
}

export function useChat() {
  const queryClient = useQueryClient();
  const teamId = useActiveTeamId();
  return useMutation({
    mutationFn: async ({
      messages,
      signal,
      onStatus,
      attachments,
      persist,
    }: {
      messages: { role: string; content: string }[];
      signal?: AbortSignal;
      onStatus?: (text: string) => void;
      attachments?: Attachment[];
      persist?: { convoId: string; teamId: string };
    }) => {
      const data = await sendChat(messages, signal, onStatus, attachments, teamId);
      // Persist the assistant reply here, inside the mutation, so it survives the
      // user navigating away mid-request. The component's onSuccess won't run once
      // Chat unmounts, so saving there would silently drop the reply.
      if (persist) {
        const reply: ChatMessage = {
          role: "assistant",
          content: data.reply,
          created: data.created,
          proposals: data.proposals,
          newAgents: data.newAgents,
          updates: data.updates,
        };
        try {
          await saveMessage(persist.convoId, persist.teamId, reply);
          await touchChat(persist.convoId);
        } catch {
          // best-effort persistence
        }
      }
      return data;
    },
    // a created agent should show up in the list immediately; a chat turn may
    // also have queued an action for approval, so refresh those too.
    onSuccess: (data) => {
      if (data.created?.length) {
        void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      }
      // The AI re-read the website and updated the business context: refresh the
      // workspace so Settings and grounding reflect it without a reload.
      if (data.contextUpdated) {
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.current });
      }
      void queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.pendingCount });
      void queryClient.invalidateQueries({ queryKey: autonomyKeys.mode });
    },
  });
}

// ---------------- conversation persistence ----------------

/** The active workspace's recent conversations, newest first. */
export const chatsQueryOptions = (teamId: string | null) =>
  queryOptions({
    queryKey: [...chatKeys.list, teamId] as const,
    queryFn: async (): Promise<ChatRow[]> => {
      const { data, error } = await supabase
        .from("chats")
        .select("id, title, updated_at")
        .eq("team_id", teamId!)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!teamId,
  });

export function useChats() {
  return useQuery(chatsQueryOptions(useActiveTeamId()));
}

/** Load a single conversation's messages, oldest first. */
export async function fetchChatMessages(chatId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, created_agents, proposals, updates")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    created: (m.created_agents as CreatedAgent[] | null) ?? undefined,
    proposals: (m.proposals as AgentProposal[] | null) ?? undefined,
    updates: (m.updates as AgentUpdate[] | null) ?? undefined,
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
    updates: message.updates ?? [],
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
