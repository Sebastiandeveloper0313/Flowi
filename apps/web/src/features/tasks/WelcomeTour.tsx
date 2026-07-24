import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowRight, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { useWorkspace } from "@/features/workspace/hooks";
import { track } from "@/integrations/posthog";

// Explains the product's mental model, so it only needs to be seen ONCE.
// v3: re-shown after the two-level redesign (agents do jobs, employees own
// areas), since the model it teaches changed.
const WELCOME_SEEN_KEY = "sentrive.welcome.seen.v3";

function hasSeenWelcome(): boolean {
  try {
    return Boolean(localStorage.getItem(WELCOME_SEEN_KEY));
  } catch {
    return false; // localStorage unavailable: show it, worst case they see it twice
  }
}

/**
 * The first-run explainer: one dialog, three sentences, zero setup steps. It
 * answers the only question a fresh user has ("what happened, what do I do?"):
 * your team already read your website; open an employee to put them to work;
 * talk to them like people; nothing ships without your OK. The CTA scrolls to
 * the team roster right below, where every next step lives.
 */
export function WelcomeTour() {
  const { data: ws } = useWorkspace();
  const [open, setOpen] = useState(false);

  const eligible = Boolean(ws?.id && ws?.business_context);

  useEffect(() => {
    if (!eligible || open || hasSeenWelcome()) return;
    // Let the dashboard paint first so the dialog arrives as its own moment.
    const timer = setTimeout(() => {
      setOpen(true);
      track("welcome_tour_shown");
    }, 700);
    return () => clearTimeout(timer);
  }, [eligible, open]);

  function finish(reason: "completed" | "skipped") {
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {
      /* localStorage blocked: nothing to persist */
    }
    track(reason === "completed" ? "welcome_tour_completed" : "welcome_tour_skipped");
    setOpen(false);
    if (reason === "completed") {
      // Take them to the roster right below, where every next step lives.
      setTimeout(
        () => document.getElementById("your-team")?.scrollIntoView({ behavior: "smooth" }),
        250,
      );
    }
  }

  if (!eligible) return null;
  const company = ws?.name && ws.name !== "My team" ? ws.name : "your business";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish("skipped")}>
      <DialogContent
        className="gap-0 overflow-hidden rounded-3xl p-0 duration-300 sm:max-w-lg"
        showCloseButton={false}
      >
        {/* soft brand wash behind the header */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#5aa6ff]/15 to-transparent" />

        <div className="animate-in fade-in-0 slide-in-from-bottom-3 relative p-8 duration-500">
          <img
            src="/sentrive.png"
            alt="Sentrive"
            className="mb-5 size-11 rounded-xl shadow-lg shadow-[#1566e6]/25"
          />
          <DialogTitle className="text-xl font-bold tracking-tight">
            Here's how Sentrive works
          </DialogTitle>
          <p className="text-muted-foreground mt-1.5 text-sm">
            We read {company}'s website, so everything you create already knows your business.
          </p>

          <div className="mt-6 space-y-4">
            <IntroRow
              icon={<MessageSquare className="size-4" />}
              title="Agents do the work"
              text="Each one runs a job on a schedule: find leads, write posts, answer email. Describe it in chat and it exists."
            />
            <IntroRow
              icon={<Users className="size-4" />}
              title="Employees manage your agents"
              text="Once you have a few, put an employee in charge: they report what got done and you chat with them, instead of checking every agent yourself."
            />
            <IntroRow
              icon={<ShieldCheck className="size-4" />}
              title="You approve everything"
              text="Nothing is posted or sent without your OK, and everything reports back."
            />
          </div>

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => finish("skipped")}
            >
              I'll look around
            </Button>
            <Button onClick={() => finish("completed")}>
              Meet my team <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IntroRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="bg-muted text-foreground grid size-9 shrink-0 place-items-center rounded-lg">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-muted-foreground text-sm">{text}</p>
      </div>
    </div>
  );
}
