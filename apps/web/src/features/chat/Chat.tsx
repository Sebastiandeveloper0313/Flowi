import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  ArrowUp,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Hash,
  Loader2,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { type ChangeEvent, type ClipboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useUser } from "@/auth/hooks";
import { AutonomyToggle } from "@/features/autonomy/AutonomyToggle";
import { MorningBrief } from "@/features/dashboard/MorningBrief";
import {
  CHANNELS,
  channelLabel,
  scheduleLabel,
  useCreateAgentFromProposal,
  useTasks,
  useUpdateAgent,
} from "@/features/tasks/hooks";
import { useActiveTeamId } from "@/features/workspace/active";

import {
  type AgentProposal,
  type AgentUpdate,
  type Attachment,
  chatKeys,
  createChat,
  fetchChatMessages,
  saveMessage,
  type ChatMessage,
  useChat,
} from "./hooks";
import { ChatMarkdown } from "./Markdown";
import { useVoiceInput } from "./useVoiceInput";

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

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB per file

function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const data = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
      const kind: Attachment["kind"] = file.type === "application/pdf" ? "document" : "image";
      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        kind,
        mediaType: file.type,
        data,
        url: kind === "image" ? dataUrl : undefined,
      });
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function SentriveAvatar() {
  return (
    <img
      src="/sentrive.png"
      alt="Sentrive"
      className="size-7 shrink-0 rounded-lg object-cover shadow-sm shadow-[#1566e6]/20"
    />
  );
}

// Common run frequencies offered on a proposal card, so the user can set "how
// often" instead of accepting Sentrive's guess. "once" maps to no schedule.
const RUN_FREQUENCIES: { value: string; label: string }[] = [
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 */2 * * *", label: "Every 2 hours" },
  { value: "0 */3 * * *", label: "Every 3 hours" },
  { value: "0 */4 * * *", label: "Every 4 hours" },
  { value: "0 */6 * * *", label: "Every 6 hours" },
  { value: "0 9,17 * * *", label: "Twice a day" },
  { value: "0 8 * * *", label: "Every day at 8 AM" },
  { value: "0 12 * * *", label: "Every day at noon" },
  { value: "0 8 * * 1-5", label: "Every weekday at 8 AM" },
  { value: "0 9 * * 1", label: "Every Monday at 9 AM" },
  { value: "once", label: "Just once" },
];

function toList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().replace(/^r\//i, ""))
    .filter(Boolean);
}

/** A proposed agent shown in chat: fine-tune every field, then create it. */
function ProposalCard({ proposal, chatId }: { proposal: AgentProposal; chatId?: string }) {
  const teamId = useActiveTeamId();
  const { data: tasks } = useTasks();
  const create = useCreateAgentFromProposal();
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null);

  const isReddit = proposal.kind === "reddit_monitor";

  // Editable draft, seeded from Sentrive's proposal.
  const [title, setTitle] = useState(proposal.title);
  const [instructions, setInstructions] = useState(proposal.instructions);
  const [cron, setCron] = useState<string>(proposal.schedule_cron ?? "once");
  const [channel, setChannel] = useState(proposal.channel);
  const [keywords, setKeywords] = useState((proposal.keywords ?? []).join(", "));
  const [subreddits, setSubreddits] = useState((proposal.subreddits ?? []).join(", "));

  // Match the created agent by the proposal id stamped into its config, so the
  // created state survives a reload even if the title was edited. Falls back to
  // the title for anything created before the id stamp existed.
  const existing = tasks?.find(
    (t) =>
      (t.config as { proposal_id?: string } | null)?.proposal_id === proposal.id ||
      t.title === proposal.title,
  );
  const done = created ?? (existing ? { id: existing.id, title: existing.title } : null);

  const options = RUN_FREQUENCIES.some((f) => f.value === cron)
    ? RUN_FREQUENCIES
    : [{ value: cron, label: scheduleLabel(cron === "once" ? null : cron) }, ...RUN_FREQUENCIES];

  function onCreate() {
    if (!teamId) return;
    create.mutate(
      {
        teamId,
        proposal: {
          title: title.trim() || proposal.title,
          instructions: instructions.trim(),
          channel,
          schedule_cron: cron === "once" ? null : cron,
          timezone: proposal.timezone,
          kind: proposal.kind,
          keywords: isReddit ? toList(keywords) : [],
          subreddits: isReddit ? toList(subreddits) : [],
          proposalId: proposal.id,
          chatId,
        },
      },
      { onSuccess: (data) => setCreated(data) },
    );
  }

  const shell =
    "border-primary/15 bg-card mt-1 max-w-md overflow-hidden rounded-2xl border shadow-sm";

  // Created / read-only state.
  if (done) {
    return (
      <div className={shell}>
        <div className="flex items-start gap-3 p-4">
          <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
            <Bot className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug font-semibold">{done.title}</p>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3" />{" "}
                {scheduleLabel(existing?.schedule_cron ?? proposal.schedule_cron)}
              </span>
              <span className="flex items-center gap-1">
                <Hash className="size-3" />{" "}
                {isReddit ? "Reddit leads" : channelLabel(existing?.channel ?? channel)}
              </span>
            </div>
          </div>
        </div>
        <div className="bg-muted/30 border-t px-4 py-2.5">
          <Link
            to="/agents/$agentId"
            params={{ agentId: done.id }}
            className="text-primary flex items-center justify-center gap-1.5 text-xs font-medium"
          >
            <CheckCircle2 className="size-3.5" /> Agent created, open it
          </Link>
        </div>
      </div>
    );
  }

  // Editable state.
  return (
    <div className={shell}>
      <div className="flex items-start gap-3 p-4">
        <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Agent name"
            className="hover:border-input focus-visible:border-input h-7 border-transparent bg-transparent px-1 text-[13px] font-semibold shadow-none"
          />
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            aria-label="What the agent does"
            className="text-muted-foreground resize-y text-xs leading-relaxed"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <CalendarClock className="size-3" /> Runs
              </span>
              <Select value={cron} onValueChange={setCron}>
                <SelectTrigger size="sm" className="h-7 text-xs" aria-label="How often it runs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isReddit && (
              <div className="grid gap-1">
                <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                  <Hash className="size-3" /> Delivers to
                </span>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Where it delivers">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {isReddit && (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <span className="text-muted-foreground text-[11px]">Keywords</span>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="auto from your business"
                  aria-label="Keywords"
                  className="h-7 text-xs"
                />
              </div>
              <div className="grid gap-1">
                <span className="text-muted-foreground text-[11px]">Subreddits</span>
                <Input
                  value={subreddits}
                  onChange={(e) => setSubreddits(e.target.value)}
                  placeholder="all of Reddit"
                  aria-label="Subreddits"
                  className="h-7 text-xs"
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="bg-muted/30 border-t px-4 py-2.5">
        <Button
          size="sm"
          className="h-8 w-full rounded-lg text-xs"
          disabled={create.isPending || !teamId}
          onClick={onCreate}
        >
          {create.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Create agent
        </Button>
        {create.isError && (
          <p className="text-destructive mt-1.5 text-[11px]">
            {(create.error as Error).message || "Couldn't create it. Try again."}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A proposed change to an existing agent. Shows exactly what will change and
 * applies only when the user clicks Confirm, so an edit is never silent.
 */
function UpdateCard({ update }: { update: AgentUpdate }) {
  const apply = useUpdateAgent();
  const [done, setDone] = useState(false);
  const c = update.changes;

  const shell =
    "border-primary/15 bg-card mt-1 max-w-md overflow-hidden rounded-2xl border shadow-sm";

  if (done) {
    return (
      <div className={shell}>
        <div className="flex items-start gap-3 p-4">
          <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
            <Pencil className="size-4" />
          </span>
          <p className="text-[13px] leading-snug font-semibold">{update.title} updated</p>
        </div>
        <div className="bg-muted/30 border-t px-4 py-2.5">
          <Link
            to="/agents/$agentId"
            params={{ agentId: update.agentId }}
            className="text-primary flex items-center justify-center gap-1.5 text-xs font-medium"
          >
            <CheckCircle2 className="size-3.5" /> Change applied, open the agent
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex items-start gap-3 p-4">
        <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
          <Pencil className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug font-semibold">Update {update.title}</p>
          <ul className="text-muted-foreground mt-1.5 space-y-1 text-[12px]">
            {c.title !== undefined && (
              <li className="flex items-center gap-1.5">
                <Pencil className="size-3" /> Rename to “{c.title}”
              </li>
            )}
            {c.schedule_cron !== undefined && (
              <li className="flex items-center gap-1.5">
                <CalendarClock className="size-3" /> Schedule: {scheduleLabel(c.schedule_cron)}
              </li>
            )}
            {c.channel !== undefined && (
              <li className="flex items-center gap-1.5">
                <Hash className="size-3" /> Delivery: {channelLabel(c.channel)}
              </li>
            )}
            {c.instructions !== undefined && (
              <li className="flex items-center gap-1.5">
                <Sparkles className="size-3" /> Instructions updated
              </li>
            )}
            {c.keywords !== undefined && (
              <li className="flex items-center gap-1.5">
                <Hash className="size-3" /> Keywords:{" "}
                {c.keywords.join(", ") || "auto from business"}
              </li>
            )}
            {c.subreddits !== undefined && (
              <li className="flex items-center gap-1.5">
                <Hash className="size-3" /> Subreddits:{" "}
                {c.subreddits.map((s) => `r/${s}`).join(", ") || "all of Reddit"}
              </li>
            )}
          </ul>
          {apply.isError && (
            <p className="text-destructive mt-2 text-[11px]">
              {(apply.error as Error)?.message || "Couldn't apply the change. Try again."}
            </p>
          )}
        </div>
      </div>
      <div className="bg-muted/30 flex justify-end border-t px-4 py-2.5">
        <Button
          size="sm"
          className="h-8 rounded-lg text-xs"
          disabled={apply.isPending}
          onClick={() =>
            apply.mutate(
              { agentId: update.agentId, changes: c },
              { onSuccess: () => setDone(true) },
            )
          }
        >
          {apply.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Confirm change
        </Button>
      </div>
    </div>
  );
}

export function Chat({ chatId }: { chatId?: string }) {
  const chat = useChat();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeTeamId = useActiveTeamId();
  const { data: user } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Thinking");
  // when a new reply arrives, reveal it character by character; null once fully shown
  const [typing, setTyping] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceInput(setInput);

  // Let other surfaces (the welcome tour, the suggestions section) hand a user
  // off to the chat to describe their own agent: they dispatch this event and we
  // bring the composer into view and focus it, so it never feels like the only
  // options are the ones we suggested.
  useEffect(() => {
    function focusComposer() {
      const el = composerRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
    window.addEventListener("sentrive:focus-composer", focusComposer);
    return () => window.removeEventListener("sentrive:focus-composer", focusComposer);
  }, []);

  async function addFiles(files: File[]) {
    const accepted: Attachment[] = [];
    for (const f of files) {
      const ok = f.type.startsWith("image/") || f.type === "application/pdf";
      if (!ok || f.size > MAX_FILE_BYTES) continue;
      try {
        accepted.push(await fileToAttachment(f));
      } catch {
        /* skip unreadable file */
      }
    }
    if (accepted.length) setAttachments((a) => [...a, ...accepted]);
  }

  async function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file
    await addFiles(files);
  }

  // paste (Ctrl+V) an image straight into the composer
  async function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const imgs = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null);
    if (!imgs.length) return;
    e.preventDefault();
    await addFiles(imgs);
  }

  function removeAttachment(id: string) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }
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
  }, [messages, chat.isPending, typing]);

  // close the image preview on Escape
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  // typewriter: advance the reveal for the last (just-arrived) assistant message
  useEffect(() => {
    if (typing === null) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") {
      setTyping(null);
      return;
    }
    if (typing >= last.content.length) {
      setTyping(null);
      return;
    }
    // reveal in small chunks so long replies still finish quickly (~1s)
    const step = Math.max(1, Math.ceil(last.content.length / 120));
    const id = setTimeout(
      () => setTyping((s) => Math.min(last.content.length, (s ?? 0) + step)),
      14,
    );
    return () => clearTimeout(id);
  }, [typing, messages]);

  async function send(text: string) {
    const t = text.trim();
    if ((!t && attachments.length === 0) || chat.isPending) return;

    const files = attachments;
    const label = t || files.map((f) => f.name).join(", ");
    const userMsg: ChatMessage = { role: "user", content: label };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setAttachments([]);

    // ensure a persisted conversation exists, then save the user's message
    let convoId = chatId ?? ownedRef.current;
    const teamId: string | null = activeTeamId;
    try {
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
        attachments: files,
        persist: convoId && teamId ? { convoId, teamId } : undefined,
      },
      {
        onSuccess: (data) => {
          // The reply is already persisted inside the mutation (so it survives the
          // user navigating away mid-request); here we only update the live UI.
          const reply: ChatMessage = {
            role: "assistant",
            content: data.reply,
            created: data.created,
            proposals: data.proposals,
            updates: data.updates,
          };
          setMessages((m) => [...m, reply]);
          setTyping(0); // reveal the new reply character by character
          void queryClient.invalidateQueries({ queryKey: chatKeys.list });
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

  // Portal to <body> so the overlay escapes .flowy-main's stacking context and
  // covers the whole viewport, including the sidebar (which sits at a higher
  // z-index inside the app shell). Without this it's trapped below the sidebar.
  const lightbox = preview
    ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6">
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-out"
            aria-label="Close preview"
            onClick={() => setPreview(null)}
          />
          <img
            src={preview}
            alt=""
            className="relative max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>,
        document.body,
      )
    : null;

  const composer = (
    <div className="bg-card focus-within:border-primary/50 focus-within:ring-primary/10 mx-auto w-full max-w-2xl rounded-[1.7rem] border p-4 shadow-[0_24px_60px_-32px_rgba(16,48,120,0.4)] transition focus-within:ring-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={onPickFiles}
      />
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {attachments.map((a) =>
            a.url ? (
              <div key={a.id} className="relative">
                <button
                  type="button"
                  onClick={() => setPreview(a.url ?? null)}
                  className="block size-16 cursor-zoom-in overflow-hidden rounded-lg border"
                  aria-label="View image"
                  title="View image"
                >
                  <img src={a.url} alt="" className="size-full object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="bg-foreground/70 hover:bg-foreground absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full text-white transition"
                  aria-label="Remove attachment"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <div
                key={a.id}
                className="bg-muted flex items-center gap-2 rounded-lg py-1 pr-1 pl-2 text-xs"
              >
                <FileText className="size-4 opacity-70" />
                <span className="max-w-[10rem] truncate">{a.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="hover:bg-accent grid size-5 place-items-center rounded"
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ),
          )}
        </div>
      )}
      <Textarea
        ref={composerRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send(input);
          }
        }}
        onPaste={onPaste}
        rows={1}
        placeholder="Tell Sentrive what to do…  e.g. “every morning, find Reddit posts asking about what we sell and draft replies for me to approve”"
        className="max-h-52 min-h-[4rem] w-full resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0"
      />
      <div className="mt-1 flex items-center justify-between px-1">
        <div className="text-muted-foreground flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="hover:bg-accent hover:text-foreground grid size-9 place-items-center rounded-full transition"
            aria-label="Attach a file"
            title="Attach image or PDF"
          >
            <Paperclip className="size-[1.05rem]" />
          </button>
          {voice.supported && (
            <button
              type="button"
              onClick={() => void voice.toggle(input)}
              className={`grid size-9 place-items-center rounded-full transition ${
                voice.listening
                  ? "bg-destructive/10 text-destructive animate-pulse"
                  : "hover:bg-accent hover:text-foreground"
              }`}
              aria-label={voice.listening ? "Stop voice input" : "Voice input"}
              title={voice.listening ? "Stop listening" : "Voice input"}
            >
              <Mic className="size-[1.05rem]" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AutonomyToggle />
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
              disabled={!input.trim() && attachments.length === 0}
              onClick={() => void send(input)}
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {voice.error && (
        <p className="text-destructive mt-1 px-2 text-xs" role="status">
          {voice.error}
        </p>
      )}
    </div>
  );

  if (empty) {
    // Top-aligned (not vertically centered) so what's under the chat, waiting
    // approvals and the agents, peeks above the fold instead of hiding below
    // a full-viewport hero.
    return (
      <div className="flex flex-col items-center px-2 pt-20 pb-12 sm:pt-24">
        <div className="w-full max-w-2xl">
          <MorningBrief />
          {composer}
        </div>
        {lightbox}
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
                <SentriveAvatar />
                <div className="min-w-0 flex-1 space-y-2">
                  {typing !== null && i === messages.length - 1 ? (
                    // revealing character by character: plain text + caret, format on finish
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {m.content.slice(0, typing)}
                      <span className="bg-foreground/70 ml-0.5 inline-block h-[1em] w-[2px] animate-pulse align-text-bottom" />
                    </div>
                  ) : (
                    <>
                      <ChatMarkdown>{m.content}</ChatMarkdown>
                      {m.created?.map((a) => (
                        <div
                          key={a.id}
                          className="border-primary/20 bg-primary/5 text-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                        >
                          <CheckCircle2 className="size-3.5" /> Agent created: {a.title}
                        </div>
                      ))}
                      {m.proposals?.map((p) => (
                        <ProposalCard
                          key={p.id}
                          proposal={p}
                          chatId={chatId ?? ownedRef.current ?? undefined}
                        />
                      ))}
                      {m.updates?.map((u) => (
                        <UpdateCard key={u.id} update={u} />
                      ))}
                      <div className="pt-0.5">
                        <CopyButton text={m.content} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ),
          )}
          {chat.isPending && (
            <div className="flex items-center gap-3">
              <SentriveAvatar />
              <span className="flowy-shimmer text-sm font-medium">{status}…</span>
            </div>
          )}
        </div>
      </div>
      <div className="px-2 pt-2 pb-6">
        {composer}
        <p className="text-muted-foreground mt-2 text-center text-xs">
          <Sparkles className="mr-1 inline size-3" />
          Sentrive can answer, or set up agents that run on their own.
        </p>
      </div>
      {lightbox}
    </div>
  );
}
