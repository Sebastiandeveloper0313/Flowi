import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { ArrowLeft, ArrowRight, CalendarClock, Check, Loader2 } from "lucide-react";
import { useState } from "react";

import { toolkitLogo, toolkitName } from "@/features/integrations/ConnectCta";
import { useConnectIntegration, useIntegrations } from "@/features/integrations/hooks";
import { useRunTask } from "@/features/tasks/hooks";
import { createAgentFromProposal } from "@/features/tasks/mutations";
import { taskKeys } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";
import { templateToProposal } from "@/features/tasks/templates";
import { useWorkspace } from "@/features/workspace/hooks";
import { track } from "@/integrations/posthog";

import { starterTemplatesOf, type EmployeeMeta, type EmployeeRole } from "./roles";

interface HireQuestion {
  id: string;
  /** The big question, addressed like you'd brief a real hire. */
  question: string;
  hint: string;
  placeholder: string;
  /** Quick-pick answers; picking one fills the input, still editable. */
  options?: string[];
  /** Label used when folding the answer into the agents' instructions. */
  short: string;
}

// The interview, per role: two questions that genuinely change the work. Every
// answer is folded into the starter skills' instructions, so this is a real
// briefing, not onboarding theater. Everything is skippable; the website
// analysis already covers the basics.
const QUESTIONS: Record<EmployeeRole, HireQuestion[]> = {
  growth: [
    {
      id: "dream-lead",
      question: "Who is your dream lead?",
      hint: "Describe the person whose post should make Maya jump. She uses this to judge every thread she finds.",
      placeholder:
        "e.g. solo founders venting that they can't get their first customers, or agencies drowning in manual invoicing",
      short: "What a dream lead looks like",
    },
    {
      id: "known-places",
      question: "Any subreddits or phrases you already know work?",
      hint: "Skip this and Maya picks her own hunting grounds from your website.",
      placeholder: "e.g. r/startups, r/indiehackers, “how do I find clients”",
      short: "Places and phrases that already work",
    },
  ],
  social: [
    {
      id: "voice",
      question: "How should your posts sound?",
      hint: "Nova writes every post in this voice.",
      placeholder: "Describe it in your own words…",
      options: ["Professional and sharp", "Friendly and casual", "Bold and opinionated"],
      short: "Voice",
    },
    {
      id: "never",
      question: "Anything Nova should never do or say?",
      hint: "Hard rules she'll respect in every post.",
      placeholder: "e.g. no emojis, never trash competitors, don't mention pricing",
      short: "Never do",
    },
  ],
  content: [
    {
      id: "topics",
      question: "What searches should your blog win?",
      hint: "The topics your customers google before they find you. Alex plans articles around these.",
      placeholder:
        "e.g. invoice templates for agencies, net 30 vs net 15, getting clients to pay on time",
      short: "Topics to own",
    },
    {
      id: "style",
      question: "Anything every article should include, or avoid?",
      hint: "Standing instructions for every piece.",
      placeholder: "e.g. always end with a link to the free trial, avoid corporate jargon",
      short: "Article rules",
    },
  ],
  support: [
    {
      id: "faq",
      question: "What are the 3–5 questions customers ask most?",
      hint: "Sam answers these confidently from day one.",
      placeholder:
        "e.g. how do I set up my first invoice, can I change plans, do you integrate with X",
      short: "Most common questions",
    },
    {
      id: "escalate",
      question: "What should Sam hand to you instead of answering?",
      hint: "His escalation line. Everything else he drafts himself for your approval.",
      placeholder: "Describe it in your own words…",
      options: [
        "Only bugs and refund requests",
        "Anything angry or sensitive",
        "Anything outside the basics",
      ],
      short: "Escalate to you",
    },
  ],
  sales: [],
  analyst: [],
};

// These connect through their own dialog on the Integrations page, not OAuth.
const DIALOG_SLUGS = new Set(["wordpress", "webhook", "slack"]);

/** Pull r/name mentions out of a free-text answer for the Reddit skills' config. */
function parseSubreddits(text: string): string[] {
  return [...new Set([...text.matchAll(/r\/([a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase()))];
}

/**
 * Hiring is an interview, like it would be for a human: a couple of questions
 * that actually shape the work, their tools, then they start. Answers are
 * folded into every starter skill's instructions ("From your manager: …"), so
 * the employee arrives briefed by the user on top of the website analysis.
 */
export function RoleHire({ meta }: { meta: EmployeeMeta }) {
  const { data: ws } = useWorkspace();
  const queryClient = useQueryClient();
  const run = useRunTask();
  const starters = starterTemplatesOf(meta);
  const questions = QUESTIONS[meta.role] ?? [];

  // steps: one per question, then tools, then review
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const toolsStep = questions.length;
  const reviewStep = questions.length + 1;

  const hire = useMutation({
    mutationFn: async () => {
      const answered = questions.filter((q) => (answers[q.id] ?? "").trim());
      const note = answered.length
        ? `\n\nFrom your manager:\n${answered.map((q) => `- ${q.short}: ${answers[q.id].trim()}`).join("\n")}`
        : "";
      const subs = parseSubreddits(Object.values(answers).join(" "));
      const created = [];
      for (const t of starters) {
        const p = templateToProposal(t);
        p.instructions += note;
        if ((t.kind === "reddit_monitor" || t.kind === "reddit_post") && subs.length)
          p.subreddits = subs;
        created.push(await createAgentFromProposal(ws!.id, p));
      }
      return created;
    },
    onSuccess: (created) => {
      track("employee_hired", { role: meta.role, skills: created.length });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      for (const agent of created) {
        if (requiredToolkits(agent).length === 0) run.mutate(agent.id);
      }
    },
  });

  if (!ws || starters.length === 0) return null;

  return (
    <div className="mx-auto max-w-2xl pt-6 sm:pt-12">
      {/* progress */}
      <div className="mb-10 flex items-center gap-1.5">
        {Array.from({ length: reviewStep + 1 }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === step
                ? "bg-primary w-6"
                : i < step
                  ? "bg-primary/40 w-3"
                  : "bg-muted-foreground/20 w-3"
            }`}
          />
        ))}
      </div>

      {step < questions.length ? (
        <QuestionStep
          key={questions[step].id}
          index={step}
          q={questions[step]}
          value={answers[questions[step].id] ?? ""}
          onChange={(v) => setAnswers((a) => ({ ...a, [questions[step].id]: v }))}
          onBack={step > 0 ? () => setStep(step - 1) : undefined}
          onNext={() => setStep(step + 1)}
        />
      ) : step === toolsStep ? (
        <ToolsStep meta={meta} onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)} />
      ) : (
        <ReviewStep
          meta={meta}
          company={ws.name && ws.name !== "My team" ? ws.name : "your business"}
          briefed={questions.some((q) => (answers[q.id] ?? "").trim())}
          hiring={hire.isPending}
          error={hire.isError ? ((hire.error as Error)?.message ?? "unknown error") : null}
          onBack={() => setStep(step - 1)}
          onHire={() => hire.mutate()}
        />
      )}
    </div>
  );
}

function QuestionStep({
  index,
  q,
  value,
  onChange,
  onBack,
  onNext,
}: {
  index: number;
  q: HireQuestion;
  value: string;
  onChange: (v: string) => void;
  onBack?: () => void;
  onNext: () => void;
}) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <span className="text-muted-foreground/30 text-5xl font-bold">{index + 1}</span>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
        {q.question}
      </h2>
      <p className="text-muted-foreground mt-2 text-sm">{q.hint}</p>

      {q.options && (
        <div className="mt-5 flex flex-wrap gap-2">
          {q.options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                value === o
                  ? "border-primary/50 bg-primary/5 text-primary"
                  : "bg-card hover:border-primary/30"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onNext();
          }
        }}
        rows={3}
        placeholder={q.placeholder}
        className="bg-card mt-4 resize-none rounded-2xl p-4 text-[15px] shadow-xs"
      />

      <div className="mt-5 flex items-center gap-2">
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        )}
        <Button className="flex-1" onClick={onNext}>
          {value.trim() ? "Next" : "Skip"} <ArrowRight className="size-4" />
        </Button>
      </div>
      <p className="text-muted-foreground mt-2 text-center text-xs">
        Enter to continue · Shift+Enter for a new line
      </p>
    </div>
  );
}

function ToolsStep({
  meta,
  onBack,
  onNext,
}: {
  meta: EmployeeMeta;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data: toolkits } = useIntegrations(true);
  const connect = useConnectIntegration();
  const EXTRA_NAMES: Record<string, string> = { wordpress: "WordPress", webhook: "Custom website" };

  async function onConnect(slug: string) {
    try {
      const { redirect_url } = await connect.mutateAsync(slug);
      window.open(redirect_url, "_blank", "noopener,noreferrer");
    } catch {
      /* surfaced via connect.isError */
    }
  }

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
        Give {meta.name} access to {meta.name === "Sam" ? "his" : "her"} tools
      </h2>
      <p className="text-muted-foreground mt-2 text-sm">
        The accounts this job runs through. Connect them now or skip; {meta.name} will remind you
        and start by {meta.name === "Sam" ? "himself" : "herself"} the moment they're connected.
      </p>

      <div className="mt-6 grid gap-2">
        {meta.relevantToolkits.map((slug) => {
          const connected = toolkits?.find((t) => t.slug === slug)?.connected ?? false;
          const name = toolkitName(slug) !== slug ? toolkitName(slug) : (EXTRA_NAMES[slug] ?? slug);
          return (
            <div
              key={slug}
              className="bg-card flex items-center gap-3 rounded-2xl border px-4 py-3.5 shadow-xs"
            >
              <img
                src={toolkitLogo(slug)}
                alt=""
                className="ring-border size-9 rounded-lg bg-white object-contain p-1 ring-1"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
              {connected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <Check className="size-3" /> Connected
                </span>
              ) : DIALOG_SLUGS.has(slug) ? (
                <Button size="sm" variant="outline" asChild>
                  <Link to="/integrations">Connect</Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={connect.isPending}
                  onClick={() => void onConnect(slug)}
                >
                  Connect
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {connect.isError && (
        <p className="text-destructive mt-2 text-xs">
          {(connect.error as Error)?.message || "Couldn't start the connection."}
        </p>
      )}

      <div className="mt-6 flex items-center gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button className="flex-1" onClick={onNext}>
          Continue <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({
  meta,
  company,
  briefed,
  hiring,
  error,
  onBack,
  onHire,
}: {
  meta: EmployeeMeta;
  company: string;
  briefed: boolean;
  hiring: boolean;
  error: string | null;
  onBack: () => void;
  onHire: () => void;
}) {
  const starters = starterTemplatesOf(meta);
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-4">
        <span
          className={`grid size-14 shrink-0 place-items-center rounded-2xl text-3xl shadow-xs ${meta.tint}`}
        >
          {meta.emoji}
        </span>
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {meta.name} is ready to start at {company}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Briefed from your website{briefed ? " and your answers" : ""}. Here's the work{" "}
            {meta.name === "Sam" ? "he" : "she"} starts with; you approve anything before it goes
            out.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-2.5">
        {starters.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.id}
              className="bg-card flex items-start gap-3 rounded-2xl border p-4 shadow-xs"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-muted-foreground text-sm">{t.tagline}</p>
                <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                  <CalendarClock className="size-3" /> {t.scheduleLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Button variant="outline" onClick={onBack} disabled={hiring}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button className="flex-1" size="lg" disabled={hiring} onClick={onHire}>
          {hiring ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {hiring ? "Starting…" : `Hire ${meta.name}`}
        </Button>
      </div>
      <p className="text-muted-foreground mt-2 text-center text-xs">
        Starts immediately. Change anything, or teach new skills, whenever you like.
      </p>
      {error && (
        <p className="text-destructive mt-3 text-sm">
          Couldn't start everything: {error}. Try again.
        </p>
      )}
    </div>
  );
}
