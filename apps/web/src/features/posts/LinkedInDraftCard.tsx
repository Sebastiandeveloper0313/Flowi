import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

import { useTaskRuns } from "../tasks/hooks";

/**
 * The latest LinkedIn post an agent wrote, shown as an editable draft on the
 * agent page instead of being buried in run history. LinkedIn auto-publishing is
 * paused upstream (Composio #3113), so the user copies the post into LinkedIn;
 * editing it before they copy also teaches Sentrive their voice for next time.
 */
export function LinkedInDraftCard({ taskId, teamId }: { taskId: string; teamId: string }) {
  const { data: runs, isLoading } = useTaskRuns(taskId);
  const latest = (runs ?? []).find((r) => r.status === "succeeded" && (r.output ?? "").trim());
  const original = (latest?.output ?? "").trim();
  const [text, setText] = useState(original);
  const [copied, setCopied] = useState(false);

  // Reseed the editor when a newer run lands.
  useEffect(() => {
    setText(original);
  }, [original]);

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!latest) {
    return (
      <p className="text-muted-foreground text-sm">
        No post yet. Hit Run now and your first LinkedIn post shows up here, ready to copy.
      </p>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
    // Editing before copying teaches the user's voice (best effort).
    if (text.trim() && text.trim() !== original) {
      void supabase.rpc("record_reply_edit", {
        p_team_id: teamId,
        p_before: original,
        p_after: text,
        p_kind: "linkedin_post",
      });
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(16, Math.max(6, text.split("\n").length + 1))}
        className="resize-y text-sm leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={copy}>
          <Copy className="size-4" /> {copied ? "Copied" : "Copy post"}
        </Button>
        <span className="text-muted-foreground text-xs">
          Auto-posting to LinkedIn is paused, so paste this in yourself. Your edits teach Sentrive
          your voice.
        </span>
      </div>
    </div>
  );
}
