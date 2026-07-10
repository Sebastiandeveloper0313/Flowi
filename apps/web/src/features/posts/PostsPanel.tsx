import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  ArrowUpRight,
  Check,
  Clock,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useConfirm } from "@/components/useConfirm";
import { ChatMarkdown } from "@/features/chat/Markdown";
import { useRunTask } from "@/features/tasks/hooks";

import {
  useAgentPostDrafts,
  useCancelQueuedDraft,
  usePublishPostDraft,
  useReschedulePost,
  useSchedulePostDraft,
  useSetPostDraftStatus,
} from "./hooks";
import { draftResults, type PostDraft } from "./queries";

type Filter = "draft" | "scheduled" | "posted" | "dismissed";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** When a queued sub-post is due to go out, in friendly relative terms. */
function whenLabel(iso?: string): string {
  if (!iso) return "soon";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 30_000) return "any moment";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ~${min} min`;
  const hrs = Math.floor(min / 60);
  const rem = min % 60;
  if (hrs < 24) return rem ? `in ~${hrs}h ${rem}m` : `in ~${hrs}h`;
  return `in ~${Math.floor(hrs / 24)}d`;
}

function cleanSub(s: string): string {
  return s.replace(/^r\//i, "").trim();
}

const pad = (n: number) => String(n).padStart(2, "0");
/** ISO -> value for a <input type="datetime-local"> in the viewer's local time. */
function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** datetime-local value -> ISO. */
function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

/** The review queue for an agent's Reddit post drafts. */
export function PostsPanel({ taskId }: { taskId: string }) {
  const { data: drafts, isLoading } = useAgentPostDrafts(taskId);
  const [filter, setFilter] = useState<Filter>("draft");

  const counts = useMemo(() => {
    const c = { draft: 0, scheduled: 0, posted: 0, dismissed: 0 };
    for (const d of drafts ?? []) {
      if (d.status === "posted") c.posted++;
      else if (d.status === "dismissed") c.dismissed++;
      else if (d.status === "queued") c.scheduled++;
      else c.draft++;
    }
    return c;
  }, [drafts]);

  const shown = (drafts ?? []).filter((d) =>
    filter === "posted"
      ? d.status === "posted"
      : filter === "dismissed"
        ? d.status === "dismissed"
        : filter === "scheduled"
          ? d.status === "queued"
          : d.status !== "posted" && d.status !== "dismissed" && d.status !== "queued",
  );

  const TABS: { key: Filter; label: string; n: number }[] = [
    { key: "draft", label: "Drafts", n: counts.draft },
    { key: "scheduled", label: "Scheduled", n: counts.scheduled },
    { key: "posted", label: "Posted", n: counts.posted },
    { key: "dismissed", label: "Dismissed", n: counts.dismissed },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              filter === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
            {t.n > 0 && <span className="ml-1.5 opacity-70">{t.n}</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading drafts...</p>
      ) : shown.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed px-6 py-12 text-center">
          <FileText className="mx-auto mb-2 size-6 opacity-60" />
          <p className="text-sm">
            {filter === "draft"
              ? "No drafts yet. Each run writes one Reddit post here for you to review, edit, and post in a click. Hit Run now to make one."
              : filter === "scheduled"
                ? "Nothing scheduled. In Auto mode, the agent queues its picked subreddits here and posts them automatically, spaced out. You can cancel or edit any before it goes out."
                : filter === "posted"
                  ? "Nothing posted yet."
                  : "Nothing dismissed."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {shown.map((draft) => (
            <PostCard key={draft.id} draft={draft} taskId={taskId} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ draft, taskId }: { draft: PostDraft; taskId: string }) {
  const publish = usePublishPostDraft();
  const schedule = useSchedulePostDraft();
  const reschedule = useReschedulePost();
  const setStatus = useSetPostDraftStatus();
  const cancelQueued = useCancelQueuedDraft();
  const runTask = useRunTask();
  const { confirm, dialog } = useConfirm();

  const results = draftResults(draft);
  const postedSubs = new Set(results.filter((r) => r.status === "posted").map((r) => r.subreddit));
  const failedBySub = new Map(
    results.filter((r) => r.status === "failed").map((r) => [r.subreddit, r]),
  );
  const hasPosted = postedSubs.size > 0;
  const dismissed = draft.status === "dismissed";
  const queued = draft.status === "queued";
  const editable = !dismissed && !hasPosted && !queued;

  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const candidates = draft.subreddits.length ? draft.subreddits : [];
  const [subs, setSubs] = useState<string[]>(candidates);
  // Which not-yet-posted subs are selected for the next post. Default: all of them.
  const [selected, setSelected] = useState<string[]>(candidates.filter((s) => !postedSubs.has(s)));
  const [newSub, setNewSub] = useState("");

  function toggle(sub: string) {
    setSelected((cur) => (cur.includes(sub) ? cur.filter((s) => s !== sub) : [...cur, sub]));
  }

  function addSub() {
    const s = cleanSub(newSub);
    if (!s || subs.some((x) => x.toLowerCase() === s.toLowerCase())) {
      setNewSub("");
      return;
    }
    setSubs((cur) => [...cur, s]);
    setSelected((cur) => [...cur, s]);
    setNewSub("");
  }

  async function post() {
    const targets = selected.filter((s) => !postedSubs.has(s));
    if (!targets.length) return;
    // One sub: post it now. Multiple: stagger them so they don't all hit Reddit
    // at once (a spam signal) - they land in Scheduled where you can retime any.
    if (targets.length === 1) {
      const ok = await confirm({
        title: `Post to r/${targets[0]} now?`,
        description:
          "This publishes the post to Reddit from your connected account now. You can still delete it on Reddit afterwards.",
        confirmLabel: "Post it",
      });
      if (ok) publish.mutate({ draftId: draft.id, subreddits: targets, title, body });
      return;
    }
    const ok = await confirm({
      title: `Schedule ${targets.length} posts?`,
      description:
        "They go out one at a time, spaced about 20 minutes apart starting now, so it never looks like a spam blast. You can change any time or post it now on the Scheduled tab.",
      confirmLabel: `Schedule ${targets.length} posts`,
    });
    if (ok) schedule.mutate({ draftId: draft.id, subreddits: targets, title, body });
  }

  async function rewrite() {
    const ok = await confirm({
      title: "Write a different post?",
      description:
        "This dismisses the current draft and generates a fresh one on a different angle. It won't post anything.",
      confirmLabel: "Write a new one",
    });
    if (!ok) return;
    await setStatus.mutateAsync({ id: draft.id, status: "dismissed" });
    runTask.mutate(taskId);
  }

  const nTargets = selected.filter((s) => !postedSubs.has(s)).length;
  const canPost = nTargets > 0 && title.trim().length > 0 && body.trim().length > 0;

  return (
    <div className={`rounded-2xl border p-5 ${dismissed ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {draft.status === "posted" ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
            Posted
          </span>
        ) : dismissed ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            Dismissed
          </span>
        ) : queued ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
            <Clock className="size-3" /> Scheduled
          </span>
        ) : (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
            Draft
          </span>
        )}
        <span className="text-muted-foreground">{timeAgo(draft.created_at)}</span>
      </div>

      {/* Title */}
      {editable ? (
        <div className="mt-3">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Title</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            className="font-semibold"
          />
        </div>
      ) : (
        <h3 className="mt-3 leading-snug font-semibold">{title}</h3>
      )}

      {/* Body */}
      {editable ? (
        <div className="mt-3">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Post</span>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="resize-y text-sm"
          />
        </div>
      ) : (
        <div className="bg-muted/40 mt-3 rounded-lg p-3">
          <ChatMarkdown>{body}</ChatMarkdown>
        </div>
      )}

      {/* Scheduled: show when each sub is going out, no editing. */}
      {queued && (
        <div className="mt-4">
          <span className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Scheduled to post
          </span>
          <div className="space-y-1.5">
            {results.map((r) => {
              if (r.status === "posted") {
                return (
                  <div key={r.subreddit} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 shrink-0 text-emerald-600" />
                    <span className="font-medium">r/{r.subreddit}</span>
                    <span className="text-muted-foreground text-xs">posted</span>
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-0.5 text-xs"
                      >
                        view <ArrowUpRight className="size-3" />
                      </a>
                    )}
                  </div>
                );
              }
              if (r.status === "failed") {
                return (
                  <div key={r.subreddit} className="flex items-center gap-2 text-sm">
                    <X className="size-4 shrink-0 text-red-500" />
                    <span className="font-medium">r/{r.subreddit}</span>
                    <span className="text-destructive text-xs">failed</span>
                  </div>
                );
              }
              return (
                <div key={r.subreddit} className="flex flex-wrap items-center gap-2 text-sm">
                  <Clock className="size-4 shrink-0 text-amber-500" />
                  <span className="w-28 truncate font-medium">r/{r.subreddit}</span>
                  <Input
                    type="datetime-local"
                    value={toLocalInput(r.at)}
                    min={toLocalInput()}
                    disabled={reschedule.isPending}
                    onChange={(e) =>
                      e.target.value &&
                      reschedule.mutate({
                        draftId: draft.id,
                        subreddit: r.subreddit,
                        at: fromLocalInput(e.target.value),
                        results,
                      })
                    }
                    className="h-7 w-auto text-xs"
                  />
                  <span className="text-muted-foreground text-xs">{whenLabel(r.at)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7"
                    disabled={publish.isPending}
                    onClick={() =>
                      publish.mutate({
                        draftId: draft.id,
                        subreddits: [r.subreddit],
                        title: draft.title,
                        body: draft.body,
                      })
                    }
                  >
                    <Send className="size-3.5" /> Post now
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!dismissed && !queued && (
        <div className="mt-4">
          <span className="text-muted-foreground mb-1.5 block text-xs font-medium">
            {hasPosted ? "Subreddits" : "Post to"}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {subs.map((sub) => {
              const isPosted = postedSubs.has(sub);
              const failed = failedBySub.get(sub);
              const url = results.find((r) => r.subreddit === sub && r.status === "posted")?.url;
              if (isPosted) {
                const chip = (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <Check className="size-3" /> r/{sub}
                    {url && <ArrowUpRight className="size-3 opacity-70" />}
                  </span>
                );
                return url ? (
                  <a key={sub} href={url} target="_blank" rel="noreferrer">
                    {chip}
                  </a>
                ) : (
                  <span key={sub}>{chip}</span>
                );
              }
              const on = selected.includes(sub);
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => toggle(sub)}
                  title={failed ? `Last attempt failed: ${failed.error ?? "error"}` : undefined}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted bg-muted/60 border-transparent"
                  } ${failed ? "ring-1 ring-red-200" : ""}`}
                >
                  r/{sub}
                  {failed && " ↻"}
                </button>
              );
            })}
            {!hasPosted && (
              <span className="inline-flex items-center gap-1">
                <Input
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSub();
                    }
                  }}
                  placeholder="add subreddit"
                  className="h-7 w-32 text-xs"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={addSub}
                  type="button"
                >
                  <Plus className="size-4" />
                </Button>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {dismissed ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setStatus.mutate({ id: draft.id, status: "draft" })}
          >
            Restore draft
          </Button>
        ) : queued ? (
          <>
            <span className="text-muted-foreground text-xs">
              Posting automatically, spaced out. Retime or post any above.
            </span>
            <div className="grow" />
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={cancelQueued.isPending}
              onClick={() => cancelQueued.mutate({ id: draft.id, results })}
            >
              <X className="size-4" /> Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              disabled={publish.isPending || schedule.isPending || !canPost}
              onClick={post}
            >
              {publish.isPending || schedule.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {publish.isPending
                ? "Posting…"
                : schedule.isPending
                  ? "Scheduling…"
                  : nTargets > 1
                    ? `Schedule ${nTargets} posts`
                    : hasPosted
                      ? "Post 1 more"
                      : "Post"}
            </Button>
            {!hasPosted && (
              <Button
                size="sm"
                variant="outline"
                disabled={runTask.isPending || setStatus.isPending}
                onClick={rewrite}
              >
                <RefreshCw className="size-4" /> Rewrite
              </Button>
            )}
            <div className="grow" />
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setStatus.mutate({ id: draft.id, status: "dismissed" })}
            >
              <X className="size-4" /> Dismiss
            </Button>
          </>
        )}
      </div>

      {publish.isError && (
        <p className="text-destructive mt-2 text-sm">
          {(publish.error as Error)?.message || "Couldn't post. Try again."}
        </p>
      )}
      {[...failedBySub.values()].length > 0 && !publish.isPending && (
        <div className="mt-2 space-y-1">
          {[...failedBySub.values()].map((f) => (
            <p key={f.subreddit} className="text-destructive text-xs">
              Couldn't post to r/{f.subreddit}: {f.error ?? "error"}. Re-select it to retry.
            </p>
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}
