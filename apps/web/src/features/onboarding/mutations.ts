import type { TablesUpdate } from "@workspace/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export interface BusinessContext {
  summary?: string;
  what_they_do?: string;
  product?: string;
  audience?: string;
  voice?: string;
  positioning?: string;
  keywords?: string[];
}

/** Patch the workspace (team). RLS scopes this to the user's own team. */
export async function updateWorkspace(teamId: string, patch: TablesUpdate<"teams">) {
  const { error } = await supabase.from("teams").update(patch).eq("id", teamId);
  if (error) throw error;
}

/** Save the user's display name on their profile. */
export async function updateProfileName(fullName: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);
  if (error) throw error;
}

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** Upload a workspace logo to storage and return its public URL. */
export async function uploadLogo(teamId: string, file: File): Promise<string> {
  if (file.size > MAX_LOGO_BYTES) throw new Error("Logo must be 5MB or smaller.");
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${teamId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("workspace-logos")
    .upload(path, file, { upsert: true, contentType: file.type || "image/png" });
  if (error) throw error;
  const { data } = supabase.storage.from("workspace-logos").getPublicUrl(path);
  return data.publicUrl;
}

/** Crawl + analyze the company's site (or description) into structured context. */
export async function analyzeWebsite(input: {
  website_url?: string;
  description?: string;
  team_id?: string;
}): Promise<BusinessContext> {
  const { data, error } = await supabase.functions.invoke("analyze-website", { body: input });
  if (error) throw error;
  return (data as { context: BusinessContext }).context;
}
