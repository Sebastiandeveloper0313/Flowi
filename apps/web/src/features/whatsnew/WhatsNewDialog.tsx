import { useQuery } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { userQueryOptions } from "@/auth/queries";
import { track } from "@/integrations/posthog";

import { RELEASES } from "./releases";

const SEEN_KEY = "sentrive.whatsnew.seen";

/**
 * A once-per-release "what's new" card. It only appears when the newest entry
 * in RELEASES hasn't been seen on this device, so routine deploys are silent
 * and only a curated big release pops up. Dismissing records the id so it never
 * shows that release again.
 */
export function WhatsNewDialog() {
  const latest = RELEASES[0];
  const { data: user } = useQuery(userQueryOptions);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!latest || !user) return;

    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      /* ignore */
    }
    if (seen === latest.id) return;

    // Only tell people about a release if they were already a user when it
    // shipped. Someone who signed up afterwards (incl. brand-new accounts still
    // in first-run) already has the feature, so we mark it seen silently rather
    // than popping it on top of their onboarding.
    const createdMs = user.created_at ? new Date(user.created_at).getTime() : 0;
    const releaseMs = latest.at ? new Date(latest.at).getTime() : 0;
    if (createdMs && releaseMs && createdMs >= releaseMs) {
      try {
        localStorage.setItem(SEEN_KEY, latest.id);
      } catch {
        /* ignore */
      }
      return;
    }

    // Let the app paint first so it lands as its own moment.
    const timer = setTimeout(() => {
      setOpen(true);
      track("whats_new_shown", { release: latest.id });
    }, 800);
    return () => clearTimeout(timer);
  }, [latest, user]);

  function dismiss() {
    if (latest) {
      try {
        localStorage.setItem(SEEN_KEY, latest.id);
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  }

  if (!latest) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent
        className="gap-0 overflow-hidden rounded-3xl p-0 duration-300 sm:max-w-lg"
        showCloseButton={false}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#5aa6ff]/15 to-transparent" />
        <div className="relative p-8">
          <div className="mb-5 flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white shadow-lg shadow-[#1566e6]/25">
              <Sparkles className="size-4.5" />
            </span>
            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              What's new · {latest.date}
            </span>
          </div>

          <DialogTitle className="text-xl font-bold tracking-tight">{latest.title}</DialogTitle>

          <div className="mt-5 space-y-4">
            {latest.highlights.map((h) => (
              <div key={h.title} className="flex items-start gap-3.5">
                <span className="bg-muted text-foreground grid size-9 shrink-0 place-items-center rounded-lg">
                  <h.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{h.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-sm">{h.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 flex justify-end">
            <Button onClick={dismiss}>Got it</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
