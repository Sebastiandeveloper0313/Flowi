// TikTok slideshow generation. The agent writes the on-screen text for a photo
// slideshow (a hook slide, value slides, a CTA slide) plus a caption. The app
// renders those over the user's images and downloads them to post to TikTok.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface Slide {
  text: string;
  role?: "hook" | "point" | "cta";
}

export interface ParsedSlideshow {
  title: string;
  slides: Slide[];
  caption: string;
}

/** Pull the slideshow JSON object out of the model's output, tolerating stray text. */
export function parseSlideshow(output: string): ParsedSlideshow | null {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(output.slice(start, end + 1));
  } catch {
    return null;
  }
  const o = obj as { title?: unknown; caption?: unknown; slides?: unknown };
  const rawSlides = Array.isArray(o.slides) ? o.slides : [];
  const slides: Slide[] = rawSlides
    .map((s, i) => {
      const text =
        typeof s === "string" ? s : typeof (s as Slide)?.text === "string" ? (s as Slide).text : "";
      const role = i === 0 ? "hook" : i === rawSlides.length - 1 ? "cta" : "point";
      return { text: String(text).trim().slice(0, 200), role } as Slide;
    })
    .filter((s) => s.text.length > 0)
    .slice(0, 10);
  if (!slides.length) return null;
  return {
    title:
      typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 200) : slides[0].text,
    slides,
    caption: typeof o.caption === "string" ? o.caption.trim().slice(0, 2000) : "",
  };
}

/** Persist a generated slideshow. Returns the row id, or null on failure. */
export async function createSlideshow(
  admin: SupabaseClient,
  task: { id: string; team_id: string },
  parsed: ParsedSlideshow,
): Promise<string | null> {
  const { data, error } = await admin
    .from("slideshows")
    .insert({
      team_id: task.team_id,
      task_id: task.id,
      title: parsed.title,
      slides: parsed.slides,
      caption: parsed.caption,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
}
