import posthog from "posthog-js";

import { supabase } from "@/integrations/supabase/client";

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com";

let enabled = false;

/** Init PostHog (analytics + session replay). No-op when the key isn't set. */
export function initPostHog() {
  if (!key || enabled) return;
  enabled = true;

  posthog.init(key, {
    api_host: host,
    // SPA: pageviews are captured manually on router navigation
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      // Capture what people type (chat prompts, the onboarding website URL) so we
      // can see intent and where they get stuck. Passwords stay masked; card
      // details never touch our DOM (Stripe checkout is hosted off-site).
      maskAllInputs: false,
      maskInputOptions: { password: true },
    },
  });

  // Tie sessions to accounts so funnels and replays have identity
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
      posthog.identify(session.user.id, { email: session.user.email });
    }
    if (event === "SIGNED_OUT") {
      posthog.reset();
    }
  });
}

/** Capture a named event; safe to call when PostHog is disabled. */
export function track(event: string, properties?: Record<string, unknown>) {
  if (!enabled) return;
  posthog.capture(event, properties);
}

/** Manual pageview for SPA navigations. */
export function trackPageview() {
  if (!enabled) return;
  posthog.capture("$pageview");
}
