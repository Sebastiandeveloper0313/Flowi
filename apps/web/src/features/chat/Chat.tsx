import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { ArrowUp, Check, CheckCircle2, Copy, Mic, Paperclip, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useUser } from "@/auth/hooks";
import { myTeamQueryOptions } from "@/features/tasks/queries";

import {
  chatKeys,
  createChat,
  fetchChatMessages,
  saveMessage,
  touchChat,
  type ChatMessage,
  useChat,
} from "./hooks";
import { ChatMarkdown } from "./Markdown";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback for older browsers / non-secure contexts
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className="text-muted-foreground hover:text-foreground inline-flex items-center transition"
      aria-label={copied ? "Copied" : "Copy message"}
      title={copied ? "Copied" : "Copy"}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function FlowyAvatar() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#5aa6ff] to-[#1566e6]">
      <svg viewBox="0 0 100 100" className="size-4" aria-hidden="true">
        <path
          d="M34 32h34M34 50h27M34 68h18"
          stroke="white"
          strokeWidth={9}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function Chat({ chatId }: { chatId?: string }) {
  const chat = useChat();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Thinking");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // the conversation whose state we already manage live; lets us tell
  // "open an existing chat" apart from "we just created this one" so we
  // never re-hydrate over an in-flight reply.
  const ownedRef = useRef<string | null>(null);

  // load a conversation's history once auth is ready (so RLS sees the user)
  const history = useQuery({
    queryKey: chatKeys.messages(chatId ?? "none"),
    queryFn: () => fetchChatMessages(chatId as string),
    enabled: !!chatId && !!user,
    staleTime: 30_000,
  });

  // starting a brand-new chat clears the thread
  useEffect(() => {
    if (!chatId) {
      ownedRef.current = null;
      setMessages([]);
    }
  }, [chatId]);

  // hydrate when opening a chat we don't already own
  useEffect(() => {
    if (chatId && history.data && ownedRef.current !== chatId) {
      ownedRef.current = chatId;
      setMessages(history.data);
    }
  }, [chatId, history.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chat.isPending]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || chat.isPending) return;

    const userMsg: ChatMessage = { role: "user", content: t };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");

    // ensure a persisted conversation exists, then save the user's message
    let convoId = chatId ?? ownedRef.current;
    let teamId: string | null = null;
    try {
      teamId = await queryClient.ensureQueryData(myTeamQueryOptions);
      if (teamId) {
        if (!convoId) {
          convoId = await createChat(teamId, t);
          ownedRef.current = convoId;
          void navigate({ to: "/dashboard", search: { c: convoId }, replace: true });
          void queryClient.invalidateQueries({ queryKey: chatKeys.list });
        }
        await saveMessage(convoId, teamId, userMsg);
      }
    } catch {
      // persistence is best-effort; the chat still works in-session
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("Thinking");
    chat.mutate(
      {
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        signal: controller.signal,
        onStatus: setStatus,
      },
      {
        onSuccess: async (data) => {
          const reply: ChatMessage = {
            role: "assistant",
            content: data.reply,
            created: data.created,
          };
          setMessages((m) => [...m, reply]);
          if (convoId && teamId) {
            try {
              await saveMessage(convoId, teamId, reply);
              await touchChat(convoId);
              void queryClient.invalidateQueries({ queryKey: chatKeys.list });
            } catch {
              /* best-effort */
            }
          }
        },
        onError: (e) => {
          // user hit stop: leave their message, add no error
          if (controller.signal.aborted || (e as Error).name === "AbortError") return;
          setMessages((m) => [
            ...m,
            { role: "assistant", content: `Something went wrong: ${(e as Error).message}` },
          ]);
        },
      },
    );
  }

  function stop() {
    abortRef.current?.abort();
  }

  const empty = messages.length === 0;

  const composer = (
    <div className="bg-card focus-within:border-primary/50 focus-within:ring-primary/10 mx-auto w-full max-w-2xl rounded-[1.7rem] border p-4 shadow-[0_24px_60px_-32px_rgba(16,48,120,0.4)] transition focus-within:ring-4">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send(input);
          }
        }}
        rows={1}
        placeholder="Tell Flowy what to do…  e.g. “every day at noon, 3 slides on menswear trends”"
        className="max-h-52 min-h-[4rem] w-full resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0"
      />
      <div className="mt-1 flex items-center justify-between px-1">
        <div className="text-muted-foreground flex items-center gap-0.5">
          <button
            type="button"
            className="hover:bg-accent hover:text-foreground grid size-9 place-items-center rounded-full transition"
            aria-label="Attach a file"
            title="Attach a file"
          >
            <Paperclip className="size-[1.05rem]" />
          </button>
          <button
            type="button"
            className="hover:bg-accent hover:text-foreground grid size-9 place-items-center rounded-full transition"
            aria-label="Voice input"
            title="Voice input"
          >
            <Mic className="size-[1.05rem]" />
          </button>
        </div>
        {chat.isPending ? (
          <Button
            size="icon"
            className="size-9 shrink-0 rounded-full"
            onClick={stop}
            aria-label="Stop generating"
            title="Stop"
          >
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="size-9 shrink-0 rounded-full"
            disabled={!input.trim()}
            onClick={() => void send(input)}
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );

  if (empty) {
    return (
      <div className="flex min-h-[82vh] flex-col items-center justify-center px-2">
        <div className="w-full max-w-2xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            What should Flowy take care of?
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 mb-8 max-w-2xl text-center">
            Ask a question, or describe a recurring job and Flowy runs it on schedule.
          </p>
          {composer}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pt-16 pb-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="group flex flex-col items-end gap-1">
                <div className="bg-primary max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-white">
                  {m.content}
                </div>
                <div className="px-1">
                  <CopyButton text={m.content} />
                </div>
              </div>
            ) : (
              <div key={i} className="group flex gap-3">
                <FlowyAvatar />
                <div className="min-w-0 flex-1 space-y-2">
                  <ChatMarkdown>{m.content}</ChatMarkdown>
                  {m.created?.map((a) => (
                    <div
                      key={a.id}
                      className="border-primary/20 bg-primary/5 text-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                    >
                      <CheckCircle2 className="size-3.5" /> Agent created: {a.title}
                    </div>
                  ))}
                  <div className="pt-0.5">
                    <CopyButton text={m.content} />
                  </div>
                </div>
              </div>
            ),
          )}
          {chat.isPending && (
            <div className="flex items-center gap-3">
              <FlowyAvatar />
              <span className="flowy-shimmer text-sm font-medium">{status}…</span>
            </div>
          )}
        </div>
      </div>
      <div className="px-2 pt-2 pb-6">
        {composer}
        <p className="text-muted-foreground mt-2 text-center text-xs">
          <Sparkles className="mr-1 inline size-3" />
          Flowy can answer, or set up agents that run on their own.
        </p>
      </div>
    </div>
  );
}
