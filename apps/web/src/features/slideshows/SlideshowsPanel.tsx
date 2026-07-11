import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { ChevronLeft, ChevronRight, Copy, Download, Film, Loader2, X } from "lucide-react";
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

/** One slide rendered to a small canvas, exactly as it'll export. Click to open. */
function SlidePreview({
  slide,
  imageUrl,
  onOpen,
}: {
  slide: RenderSlide;
  imageUrl?: string;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (c) void renderSlide(c, slide, imageUrl, { width: 320 });
  }, [slide, imageUrl]);
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Click to view larger"
      className="hover:ring-primary shrink-0 rounded-lg transition hover:ring-2"
    >
      <canvas
        ref={ref}
        className="block w-[116px] rounded-lg border"
        style={{ aspectRatio: "9 / 16" }}
      />
    </button>
  );
}

/** Fullscreen slide viewer with left/right navigation. */
function SlideViewer({
  slides,
  imgFor,
  start,
  onClose,
}: {
  slides: RenderSlide[];
  imgFor: (i: number) => string | undefined;
  start: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (c) void renderSlide(c, slides[i], imgFor(i), { width: 600 });
  }, [i, slides, imgFor]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setI((n) => (n - 1 + slides.length) % slides.length);
      else if (e.key === "ArrowRight") setI((n) => (n + 1) % slides.length);
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);

  const go = (delta: number) => setI((n) => (n + delta + slides.length) % slides.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      {/* Full-screen backdrop button: click anywhere outside the slide closes it. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close viewer"
        className="absolute inset-0 cursor-default"
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white/70 transition hover:text-white"
        aria-label="Close"
      >
        <X className="size-7" />
      </button>
      <button
        type="button"
        onClick={() => go(-1)}
        className="absolute left-3 z-10 rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white sm:left-6"
        aria-label="Previous slide"
      >
        <ChevronLeft className="size-7" />
      </button>
      <div className="relative z-10 flex flex-col items-center gap-3">
        <canvas ref={ref} className="max-h-[82vh] w-auto rounded-xl shadow-2xl" />
        <span className="text-sm text-white/70">
          {i + 1} / {slides.length}
        </span>
      </div>
      <button
        type="button"
        onClick={() => go(1)}
        className="absolute right-3 z-10 rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white sm:right-6"
        aria-label="Next slide"
      >
        <ChevronRight className="size-7" />
      </button>
    </div>
  );
}

/** The generated TikTok slideshows for one agent. `images` are the user's uploads. */
export function SlideshowsPanel({ taskId, images }: { taskId: string; images: string[] }) {
  const { data: shows, isLoading } = useAgentSlideshows(taskId);
  const [tab, setTab] = useState<"active" | "dismissed">("active");

  const all = shows ?? [];
  const active = all.filter((s) => s.status !== "dismissed");
  const dismissed = all.filter((s) => s.status === "dismissed");
  const shown = tab === "dismissed" ? dismissed : active;

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading slideshows...</p>;

  return (
    <div>
      {/* A Dismissed tab only appears once something's been dismissed, so a fresh
          panel stays clean. Matches the Leads/Posts panels' New/Dismissed split. */}
      {dismissed.length > 0 && (
        <div className="mb-4 flex gap-1.5">
          {(
            [
              { key: "active", label: "Slideshows", n: active.length },
              { key: "dismissed", label: "Dismissed", n: dismissed.length },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
              {t.n > 0 && <span className="ml-1.5 opacity-70">{t.n}</span>}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed px-6 py-12 text-center">
          <Film className="mx-auto mb-2 size-6 opacity-60" />
          <p className="text-sm">
            {tab === "dismissed"
              ? "Nothing dismissed."
              : "No slideshows yet. Each run writes a fresh TikTok slideshow here, rendered over your images. Upload a few images on the right, then hit Run now."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {shown.map((show) => (
            <SlideshowCard key={show.id} show={show} images={images} />
          ))}
        </div>
      )}
    </div>
  );
}

function SlideshowCard({ show, images }: { show: Slideshow; images: string[] }) {
  const setStatus = useSetSlideshowStatus();
  const updateShow = useUpdateSlideshow();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [caption, setCaption] = useState(show.caption);
  const [viewerAt, setViewerAt] = useState<number | null>(null);
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
        {show.status === "dismissed" ? (
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-medium">
            Dismissed
          </span>
        ) : show.status === "exported" ? (
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
          <SlidePreview key={i} slide={slide} imageUrl={imgFor(i)} onOpen={() => setViewerAt(i)} />
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
        {show.status === "dismissed" ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setStatus.mutate({ id: show.id, status: "draft" })}
          >
            Restore
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setStatus.mutate({ id: show.id, status: "dismissed" })}
          >
            <X className="size-4" /> Dismiss
          </Button>
        )}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Downloads the slides as images. Open TikTok, tap +, choose photo mode, and add them in
        order.
      </p>

      {viewerAt !== null && (
        <SlideViewer
          slides={slides}
          imgFor={imgFor}
          start={viewerAt}
          onClose={() => setViewerAt(null)}
        />
      )}
    </div>
  );
}
