import { supabase } from "@/integrations/supabase/client";

export async function setSlideshowStatus(id: string, status: "draft" | "exported" | "dismissed") {
  const { error } = await supabase.from("slideshows").update({ status }).eq("id", id);
  if (error) throw error;
}
