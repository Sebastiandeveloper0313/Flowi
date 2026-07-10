// Renders a slideshow's text over the user's images to a canvas, at TikTok's
// 9:16 (1080x1920) full-res for download, or scaled down for previews. All the
// slide visuals live here so preview and export look identical.

export interface RenderSlide {
  text: string;
  role?: "hook" | "point" | "cta";
}

const BASE_W = 1080;
const RATIO = 16 / 9;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = url;
  });
}

/** Draw an image to fully cover w x h, center-cropped. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
): void {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Render one slide. width sets resolution (1080 for export, ~360 for preview). */
export async function renderSlide(
  canvas: HTMLCanvasElement,
  slide: RenderSlide,
  imageUrl: string | undefined,
  opts?: { width?: number; accent?: string },
): Promise<void> {
  const W = opts?.width ?? BASE_W;
  const H = Math.round(W * RATIO);
  const k = W / BASE_W; // scale factor vs the 1080 design
  const accent = opts?.accent ?? "#3d82f5";
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background: the user's image (cover) or a dark gradient fallback.
  let drew = false;
  if (imageUrl) {
    try {
      const img = await loadImage(imageUrl);
      drawCover(ctx, img, W, H);
      drew = true;
    } catch {
      /* fall through to gradient */
    }
  }
  if (!drew) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#1f2937");
    g.addColorStop(1, "#0b1220");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Scrim so text stays legible over any photo.
  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0, "rgba(0,0,0,0.40)");
  scrim.addColorStop(0.5, "rgba(0,0,0,0.20)");
  scrim.addColorStop(1, "rgba(0,0,0,0.70)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  const isCta = slide.role === "cta";
  const isHook = slide.role === "hook";
  const fontSize = Math.round((isHook ? 98 : isCta ? 88 : 78) * k);
  ctx.font = `800 ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = W - 160 * k;
  const lines = wrapText(ctx, slide.text, maxWidth);
  const lineHeight = fontSize * 1.16;
  const blockH = lines.length * lineHeight;
  const top = H / 2 - blockH / 2;

  // Accent bar above the headline / CTA.
  if (isHook || isCta) {
    ctx.fillStyle = accent;
    const barW = 150 * k;
    const barH = 12 * k;
    ctx.fillRect(W / 2 - barW / 2, top - 60 * k, barW, barH);
  }

  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 28 * k;
  ctx.shadowOffsetY = 2 * k;
  let y = top + lineHeight / 2;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineHeight;
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Small "swipe" hint on the hook slide.
  if (isHook) {
    ctx.font = `600 ${Math.round(30 * k)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("swipe →", W / 2, H - 90 * k);
  }
}

/** Render a slide at full resolution and trigger a PNG download. */
export async function downloadSlide(
  slide: RenderSlide,
  imageUrl: string | undefined,
  filename: string,
  accent?: string,
): Promise<void> {
  const canvas = document.createElement("canvas");
  await renderSlide(canvas, slide, imageUrl, { width: BASE_W, accent });
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
