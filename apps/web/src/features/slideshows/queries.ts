import { queryOptions } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

import type { RenderSlide } from "./render";

export type Slideshow = Tables<"slideshows">;

/** The slide list out of the jsonb column, safely typed. */
export function slideshowSlides(s: Slideshow): RenderSlide[] {
  return Array.isArray(s.slides) ? (s.slides as unknown as RenderSlide[]) : [];
}

export const slideshowKeys = {
  all: ["slideshows"] as const,
};

export const slideshowsByTaskQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: [...slideshowKeys.all, taskId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slideshows")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
