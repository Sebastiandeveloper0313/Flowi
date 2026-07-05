import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_SUPABASE_URL: z.string().url(),
    VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    VITE_POSTHOG_KEY: z.string().min(1).optional(),
    VITE_POSTHOG_HOST: z.string().url().optional(),
  },
  server: {
    HOST: z.string(),
    PORT: z.coerce.number(),
  },
  runtimeEnvStrict: {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
    VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST,
    HOST: import.meta.env.HOST,
    PORT: import.meta.env.PORT,
  },
  emptyStringAsUndefined: true,
});
