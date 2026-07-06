import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const authKeys = {
  user: ["auth", "user"] as const,
};

/** True when the URL still carries auth tokens from a provider/confirm redirect. */
export function returningFromOAuth(): boolean {
  return window.location.hash.includes("access_token") || /[?&]code=/.test(window.location.search);
}

/** Resolve when the client finishes the OAuth exchange (or after a timeout). */
function waitForSignedIn(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        clearTimeout(timer);
        data.subscription.unsubscribe();
        resolve();
      }
    });
    const timer = setTimeout(() => {
      data.subscription.unsubscribe();
      resolve();
    }, ms);
  });
}

async function fetchUser() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export const userQueryOptions = queryOptions({
  queryKey: authKeys.user,
  queryFn: async () => {
    let user = await fetchUser();
    // Landing back from Google (etc.) the tokens in the URL may still be
    // mid-exchange when the route guard asks who is signed in. Concluding
    // "signed out" here would get cached and break the onboarding redirect,
    // so wait for the exchange to finish before answering.
    if (!user && returningFromOAuth()) {
      await waitForSignedIn(8000);
      user = await fetchUser();
    }
    return user;
  },
  staleTime: Infinity,
  retry: false,
});
