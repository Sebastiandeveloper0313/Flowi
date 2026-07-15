import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Copy, Download, Loader2, MessageSquare } from "lucide-react";
import { useState } from "react";

import { chatKeys, createChat, saveMessage } from "@/features/chat/hooks";
import { useActiveTeamId } from "@/features/workspace/active";

/**
 * Actions for a finished run's output, so a result is never a dead end: copy the
 * deliverable, or continue it in a fresh chat seeded with the output (as an
 * assistant message) so the user can pick it up with full context. Shared by the
 * Activity feed and the agent run history.
 */
export function RunResultActions({ output, title }: { output: string; title: string }) {
  const [seeding, setSeeding] = useState(false);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const teamId = useActiveTeamId();

  async function continueInChat() {
    if (!teamId || !output || seeding) return;
    setSeeding(true);
    try {
      const id = await createChat(teamId, `Continue: ${title}`);
      await saveMessage(id, teamId, { role: "assistant", content: output });
      await queryClient.invalidateQueries({ queryKey: chatKeys.list });
      await navigate({ to: "/dashboard", search: { c: id } });
    } catch {
      setSeeding(false);
    }
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (non-secure context); nothing to do
    }
  }

  /** Save the deliverable as a Markdown file, so an article or write-up can be
   *  taken straight to a blog/CMS or edited, instead of only living in-app. */
  function downloadOutput() {
    const name =
      title
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .toLowerCase() || "sentrive-result";
    const blob = new Blob([output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-3 flex items-center gap-4 border-t pt-3">
      <button
        type="button"
        onClick={copyOutput}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        onClick={downloadOutput}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
      >
        <Download className="size-3.5" />
        Download
      </button>
      <button
        type="button"
        onClick={continueInChat}
        disabled={seeding}
        className="text-primary inline-flex items-center gap-1.5 text-xs font-medium hover:underline disabled:opacity-60"
      >
        {seeding ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <MessageSquare className="size-3.5" />
        )}
        {seeding ? "Opening…" : "Continue in chat"}
      </button>
    </div>
  );
}
