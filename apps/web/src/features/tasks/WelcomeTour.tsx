import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Inbox,
  Loader2,
  MessageSquarePlus,
  PenLine,
  Radar,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ConnectButton, toolkitLogo, toolkitName } from "@/features/integrations/ConnectCta";
import { useMissingToolkits } from "@/features/integrations/hooks";
import { useWorkspace } from "@/features/workspace/hooks";
import { track } from "@/integrations/posthog";

import { scheduleLabel, useRunTask, useTasks } from "./hooks";
import { createAgentFromProposal } from "./mutations";
import { taskKeys } from "./queries";
import { requiredToolkits } from "./requirements";
import { fetchAgentSuggestions, type AgentSuggestion } from "./suggestions";

type Step = "intro" | "pick" | "live";

interface CreatedAgent {
  id: string;
  title: string;
  kind: string;
}

/**
 * First-run welcome: a guided dialog that opens once on a fresh dashboard,
 * explains how Sentrive works, presents the personalized starter agents, and
 * walks through deploying them and connecting the channel they need. Shown a
 * single time per team; closing it in any way counts as seen, and the inline
 * suggestions section stays available below as the fallback path.
 */
export function WelcomeTour() {
  const { data: ws } = useWorkspace();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const queryClient = useQueryClient();

  const teamId = ws?.id;
  const seenKey = teamId ? `sentrive.welcome.${teamId}` : null;
  const eligible = Boolean(teamId && ws?.business_context) && !tasksLoading && tasks?.length === 0;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("intro");
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [created, setCreated] = useState<CreatedAgent[]>([]);

  useEffect(() => {
    if (!eligible || !seenKey || open) return;
    if (localStorage.getItem(seenKey)) return;
    // Let the dashboard paint first so the dialog arrives as its own moment.
    // No one-shot guard here: the timer must survive StrictMode's
    // mount-cleanup-mount cycle, so it re-arms until it actually opens.
    const timer = setTimeout(() => {
      setOpen(true);
      track("welcome_tour_shown");
    }, 700);
    return () => clearTimeout(timer);
  }, [eligible, seenKey, open]);

  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    isError: suggestionsError,
    refetch,
  } = useQuery({
    queryKey: ["agent-suggestions", teamId],
    queryFn: () => fetchAgentSuggestions(teamId!),
    enabled: Boolean(teamId && ws?.business_context),
    staleTime: Infinity,
    retry: 1,
  });

  // Preselect everything once suggestions arrive.
  useEffect(() => {
    if (suggestions && selected === null) setSelected(new Set(suggestions.map((s) => s.id)));
  }, [suggestions, selected]);

  function markSeen() {
    if (seenKey) localStorage.setItem(seenKey, "1");
  }

  function finish(reason: "completed" | "skipped") {
    markSeen();
    track(reason === "completed" ? "welcome_tour_completed" : "welcome_tour_skipped", {
      step,
      deployed: created.length,
    });
    setOpen(false);
  }

  // Escape hatch from the suggestions: hand the user to the chat to describe
  // their own agent, so the three ideas never feel like the only choices.
  function describeOwn() {
    track("welcome_tour_describe_own");
    finish("skipped");
    // Let the dialog close, then bring the chat composer underneath into focus.
    setTimeout(() => window.dispatchEvent(new CustomEvent("sentrive:focus-composer")), 350);
  }

  async function deploy() {
    if (!teamId || !suggestions || !selected || creating) return;
    setCreating(true);
    setCreateError(false);
    const out: CreatedAgent[] = [];
    for (const s of suggestions.filter((x) => selected.has(x.id))) {
      try {
        const agent = await createAgentFromProposal(teamId, {
          title: s.title,
          instructions: s.instructions,
          channel: s.channel,
          schedule_cron: s.schedule_cron,
          timezone: s.timezone,
          kind: s.kind,
          keywords: s.keywords,
          subreddits: s.subreddits,
          proposalId: s.id,
        });
        out.push({ id: agent.id, title: s.title, kind: s.kind });
        track("suggested_agent_created", { kind: s.kind, title: s.title, via: "welcome_tour" });
      } catch {
        setCreateError(true);
      }
    }
    setCreating(false);
    void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    if (out.length > 0) {
      setCreated(out);
      setStep("live");
    }
  }

  if (!teamId) return null;

  const company = ws?.name && ws.name !== "My team" ? ws.name : "your business";
  const selectedCount = selected?.size ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish(step === "live" ? "completed" : "skipped");
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden rounded-3xl p-0 duration-300 sm:max-w-xl"
        showCloseButton={false}
      >
        {/* soft brand wash behind the header */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#5aa6ff]/15 to-transparent" />

        <div
          key={step}
          className="animate-in fade-in-0 slide-in-from-bottom-3 relative p-8 duration-500"
        >
          {step === "intro" && (
            <>
              <img
                src="/sentrive.png"
                alt="Sentrive"
                className="mb-5 size-11 rounded-xl shadow-lg shadow-[#1566e6]/25"
              />
              <DialogTitle className="text-xl font-bold tracking-tight">
                Meet your new marketing employee
              </DialogTitle>
              <p className="text-muted-foreground mt-1.5 text-sm">
                Sentrive runs marketing agents for {company}. Here is how it works.
              </p>

              <div className="mt-6 space-y-4">
                <IntroRow
                  icon={<Radar className="size-4" />}
                  title="Agents work on a schedule"
                  text="Find leads, draft posts, watch competitors. Daily or weekly, you choose."
                />
                <IntroRow
                  icon={<Inbox className="size-4" />}
                  title="Results come to you"
                  text="Everything lands on your dashboard or in your inbox."
                />
                <IntroRow
                  icon={<ShieldCheck className="size-4" />}
                  title="You stay in control"
                  text="Nothing is posted or sent without your approval."
                />
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => finish("skipped")}
                >
                  I'll explore on my own
                </Button>
                <Button onClick={() => setStep("pick")}>
                  Show my agents <ArrowRight className="size-4" />
                </Button>
              </div>
            </>
          )}

          {step === "pick" && (
            <>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Built for {company}
              </DialogTitle>
              <p className="text-muted-foreground mt-1.5 text-sm">
                Three agents designed from your website. Deselect any you don't want, and you can
                edit everything later.
              </p>

              <div className="mt-5 space-y-2.5">
                {suggestionsLoading || !suggestions ? (
                  suggestionsError ? (
                    <div className="text-muted-foreground rounded-xl border border-dashed px-5 py-8 text-center text-sm">
                      Couldn't design your agents just now.
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2"
                        onClick={() => refetch()}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <div className="text-muted-foreground flex items-center justify-center gap-2 rounded-xl border border-dashed px-5 py-10 text-sm">
                      <Loader2 className="size-4 animate-spin" />
                      Designing your starter team from your website…
                    </div>
                  )
                ) : (
                  suggestions.map((s) => (
                    <PickCard
                      key={s.id}
                      suggestion={s}
                      checked={selected?.has(s.id) ?? false}
                      onToggle={() =>
                        setSelected((prev) => {
                          const next = new Set(prev ?? []);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        })
                      }
                    />
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={describeOwn}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/40 mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-3 text-sm transition-colors"
              >
                <MessageSquarePlus className="size-4" /> None of these fit? Describe your own
              </button>

              {createError && (
                <p className="text-destructive mt-3 text-xs">
                  Some agents couldn't be created. Try again.
                </p>
              )}

              <div className="mt-6 flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setStep("intro")}
                >
                  Back
                </Button>
                <Button disabled={creating || selectedCount === 0 || !suggestions} onClick={deploy}>
                  {creating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Deploying…
                    </>
                  ) : (
                    <>
                      Deploy {selectedCount} agent{selectedCount === 1 ? "" : "s"}
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {step === "live" && <LiveStep created={created} onDone={() => finish("completed")} />}
        </div>

        {/* progress dots */}
        <div className="relative flex items-center gap-1.5 px-8 pb-6">
          {(["intro", "pick", "live"] as Step[]).map((s) => (
            <span
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step ? "bg-primary w-6" : "bg-muted-foreground/25 w-1.5"
              }`}
            />
          ))}
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

function PickCard({
  suggestion: s,
  checked,
  onToggle,
}: {
  suggestion: AgentSuggestion;
  checked: boolean;
  onToggle: () => void;
}) {
  const Icon = s.kind === "reddit_monitor" ? Radar : PenLine;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-xl border p-4 text-left transition-all duration-200 ${
        checked ? "border-primary/50 bg-primary/5 ring-primary/20 ring-2" : "hover:bg-muted/50"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{s.title}</p>
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{s.pitch}</p>
          <p className="text-muted-foreground mt-1.5 flex items-center gap-1 text-xs">
            <CalendarClock className="size-3" /> {scheduleLabel(s.schedule_cron)}
          </p>
        </div>
        <span
          className={`grid size-5 shrink-0 place-items-center rounded-full border transition-colors ${
            checked ? "border-primary bg-primary text-white" : "border-muted-foreground/30"
          }`}
        >
          {checked && <Check className="size-3" />}
        </span>
      </div>
    </button>
  );
}

function LiveStep({ created, onDone }: { created: CreatedAgent[]; onDone: () => void }) {
  const needs = [...new Set(created.flatMap((a) => requiredToolkits(a)))];
  const { missing, loaded } = useMissingToolkits(needs);
  const hasLeadWatch = created.some((a) => a.kind === "reddit_monitor");
  const allConnected = loaded && missing.length === 0;
  const run = useRunTask();
  const started = useRef<Set<string>>(new Set());

  // Each agent's first run starts itself the moment it can succeed: content
  // agents right away, the lead watch once its connection lands.
  useEffect(() => {
    if (!loaded) return;
    for (const a of created) {
      const ready = requiredToolkits(a).every((slug) => !missing.includes(slug));
      if (ready && !started.current.has(a.id)) {
        started.current.add(a.id);
        run.mutate(a.id);
      }
    }
  }, [loaded, missing, created, run]);

  return (
    <>
      <DialogTitle className="text-xl font-bold tracking-tight">Your team is live</DialogTitle>
      <p className="text-muted-foreground mt-1.5 text-sm">
        {allConnected
          ? "First runs are underway. Results land on each agent's page."
          : "First runs are underway. One more step and the lead watch can join in."}
      </p>

      <div className="mt-5 space-y-2">
        {created.map((a, i) => (
          <div
            key={a.id}
            className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 duration-500"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <span className="grid size-5 place-items-center rounded-full bg-emerald-500 text-white">
              <Check className="size-3" />
            </span>
            <span className="text-sm font-medium">{a.title}</span>
          </div>
        ))}
      </div>

      {loaded && missing.length > 0 && (
        <div className="mt-4 space-y-2">
          {missing.map((slug) => (
            <div
              key={slug}
              className="bg-card flex items-center gap-3 rounded-xl border p-3.5 shadow-xs"
            >
              <img
                src={toolkitLogo(slug)}
                alt={toolkitName(slug)}
                className="ring-border size-10 shrink-0 rounded-xl bg-white object-contain p-1.5 ring-1"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Connect {toolkitName(slug)}</p>
                <p className="text-muted-foreground text-xs">
                  {slug === "reddit" && hasLeadWatch
                    ? "The first scan starts by itself once connected."
                    : "Takes about 30 seconds."}
                </p>
              </div>
              <ConnectButton toolkit={slug} />
            </div>
          ))}
          <p className="text-muted-foreground text-xs">
            Takes about 30 seconds. You approve every reply before it's sent.
          </p>
        </div>
      )}

      {allConnected && needs.length > 0 && (
        <p className="animate-in fade-in-0 mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-600 duration-500">
          <Check className="size-4" /> {needs.map(toolkitName).join(" and ")} connected, first scan
          started
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={onDone} variant={allConnected ? "default" : "outline"}>
          Take me to my agents <ArrowRight className="size-4" />
        </Button>
      </div>
    </>
  );
}
