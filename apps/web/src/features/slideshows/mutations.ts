import { supabase } from "@/integrations/supabase/client";

export async function setSlideshowStatus(id: string, status: "draft" | "exported" | "dismissed") {
  const { error } = await supabase.from("slideshows").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Save edits to a slideshow (caption, title, or the slide texts). */
export async function updateSlideshow(
  id: string,
  patch: { title?: string; caption?: string; slides?: unknown },
) {
  const { error } = await supabase.from("slideshows").update(patch).eq("id", id);
  if (error) throw error;
}
