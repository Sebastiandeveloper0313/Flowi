import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { Copy, Download, Film, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAgentSlideshows, useSetSlideshowStatus, useUpdateSlideshow } from "./hooks";
import { type Slideshow, slideshowSlides } from "./queries";
import { downloadSlide, type RenderSlide, renderSlide } from "./render";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** One slide rendered to a small canvas, exactly as it'll export. */
function SlidePreview({ slide, imageUrl }: { slide: RenderSlide; imageUrl?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (c) void renderSlide(c, slide, imageUrl, { width: 320 });
  }, [slide, imageUrl]);
  return (
    <canvas
      ref={ref}
      className="w-[116px] shrink-0 rounded-lg border"
      style={{ aspectRatio: "9 / 16" }}
    />
  );
}

/** The generated TikTok slideshows for one agent. `images` are the user's uploads. */
export function SlideshowsPanel({ taskId, images }: { taskId: string; images: string[] }) {
  const { data: shows, isLoading } = useAgentSlideshows(taskId);
  const visible = (shows ?? []).filter((s) => s.status !== "dismissed");

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading slideshows...</p>;
  if (visible.length === 0) {
    return (
      <div className="text-muted-foreground rounded-2xl border border-dashed px-6 py-12 text-center">
        <Film className="mx-auto mb-2 size-6 opacity-60" />
        <p className="text-sm">
          No slideshows yet. Each run writes a fresh TikTok slideshow here, rendered over your
          images. Upload a few images on the right, then hit Run now.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {visible.map((show) => (
        <SlideshowCard key={show.id} show={show} images={images} />
      ))}
    </div>
  );
}

function SlideshowCard({ show, images }: { show: Slideshow; images: string[] }) {
  const setStatus = useSetSlideshowStatus();
  const updateShow = useUpdateSlideshow();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [caption, setCaption] = useState(show.caption);
  const slides = slideshowSlides(show);
  const imgFor = (i: number) => (images.length ? images[i % images.length] : undefined);

  function saveCaption() {
    if (caption !== show.caption) updateShow.mutate({ id: show.id, patch: { caption } });
  }

  async function downloadAll() {
    setDownloading(true);
    try {
      for (let i = 0; i < slides.length; i++) {
        await downloadSlide(slides[i], imgFor(i), `slide-${String(i + 1).padStart(2, "0")}.png`);
        await new Promise((r) => setTimeout(r, 350)); // let each download start
      }
      setStatus.mutate({ id: show.id, status: "exported" });
    } finally {
      setDownloading(false);
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="rounded-2xl border p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {show.status === "exported" ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
            Downloaded
          </span>
        ) : (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
            Ready
          </span>
        )}
        <span className="text-muted-foreground">
          {slides.length} slides · {timeAgo(show.created_at)}
        </span>
      </div>

      <h3 className="mt-2 leading-snug font-semibold">{show.title}</h3>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {slides.map((slide, i) => (
          <SlidePreview key={i} slide={slide} imageUrl={imgFor(i)} />
        ))}
      </div>

      <div className="mt-3">
        <span className="text-muted-foreground mb-1 block text-xs font-medium">Caption</span>
        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={saveCaption}
          rows={4}
          placeholder="Write a caption…"
          className="resize-y text-sm"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={downloadAll} disabled={downloading}>
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {downloading ? "Downloading…" : "Download slides"}
        </Button>
        {caption.trim() && (
          <Button size="sm" variant="outline" onClick={copyCaption}>
            <Copy className="size-4" /> {copied ? "Copied" : "Copy caption"}
          </Button>
        )}
        <div className="grow" />
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setStatus.mutate({ id: show.id, status: "dismissed" })}
        >
          <X className="size-4" /> Dismiss
        </Button>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Downloads the slides as images. Open TikTok, tap +, choose photo mode, and add them in
        order.
      </p>
    </div>
  );
}
