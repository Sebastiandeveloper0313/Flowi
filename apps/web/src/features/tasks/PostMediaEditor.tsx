import { Button } from "@workspace/ui/components/button";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { useActiveTeamId } from "@/features/workspace/active";

import { useUpdateTaskConfig } from "./hooks";
import { type AgentMedia, uploadAgentMedia } from "./mutations";
import type { Task } from "./queries";

/**
 * Attach an image or video the poster agent should include with its posts.
 * The file is uploaded to storage and its public URL saved on the agent's
 * config; the runner passes that URL to the platform's media post action.
 */
export function PostMediaEditor({ agent }: { agent: Task }) {
  const teamId = useActiveTeamId();
  const update = useUpdateTaskConfig();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = ((agent.config as Record<string, unknown> | null) ?? {}) as Record<
    string,
    unknown
  >;
  const media = config.media as AgentMedia | undefined;

  async function onFile(file: File | undefined) {
    if (!file || !teamId) return;
    setError(null);
    setUploading(true);
    try {
      const uploaded = await uploadAgentMedia(teamId, agent.id, file);
      await update.mutateAsync({ id: agent.id, config: { ...config, media: uploaded } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    const { media: _drop, ...rest } = config;
    await update.mutateAsync({ id: agent.id, config: rest });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Post media</span>
        {media && (
          <button
            type="button"
            onClick={remove}
            disabled={update.isPending}
            className="text-muted-foreground hover:text-destructive flex items-center gap-1 text-xs"
          >
            <X className="size-3.5" /> Remove
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {media ? (
        <div className="overflow-hidden rounded-lg border">
          {media.type === "video" ? (
            <video src={media.url} controls className="max-h-44 w-full bg-black object-contain">
              <track kind="captions" />
            </video>
          ) : (
            <img src={media.url} alt="Post media" className="max-h-44 w-full object-contain" />
          )}
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <ImagePlus className="size-4" /> Add an image or video
            </>
          )}
        </Button>
      )}

      <p className="text-muted-foreground mt-1.5 text-xs">
        {media
          ? "This goes out with every post from this agent. Remove it to post text only."
          : "Optional. Attach your own image or video (up to 50MB) to include with each post."}
      </p>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
    </div>
  );
}
