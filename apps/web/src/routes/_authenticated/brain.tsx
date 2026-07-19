import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  AlertTriangle,
  Brain,
  Check,
  Globe,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/features/dashboard/ui";
import { EmployeeAvatar } from "@/features/employees/EmployeeAvatar";
import { EMPLOYEES } from "@/features/employees/roles";
import type { BusinessContext } from "@/features/onboarding/mutations";
import { useTasks } from "@/features/tasks/hooks";
import {
  useAnalyzeWebsite,
  useSaveBusinessContext,
  useUpdateAutoPostPacing,
  useUpdateReplyInstructions,
  useWorkspace,
} from "@/features/workspace/hooks";

export const Route = createFileRoute("/_authenticated/brain")({
  component: BrainPage,
});

/**
 * The team's shared brain: everything Sentrive knows about the business, and
 * the one place to teach it more. Every employee works from what's on this
 * page, so it doubles as the answer to "how do they know what to write?".
 */
function BrainPage() {
  const { data: tasks } = useTasks();
  // Reply-style and pacing only matter to someone running a Reddit agent;
  // hide them from everyone else so the brain isn't full of dead knobs.
  const hasReddit = (tasks ?? []).some(
    (t) => t.kind === "reddit_monitor" || t.kind === "reddit_post",
  );

  return (
    <div className="flowy-page">
      <PageHeader
        title="Brain"
        subtitle="Everything your team knows about your business. Every employee works from this page."
      />

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#bcd6f2] bg-[#eef4fd] p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white">
              <Brain className="size-5" />
            </span>
            <div>
              <p className="font-semibold">One brain, shared by the whole team.</p>
              <p className="text-muted-foreground text-sm">
                Whatever you add here, every employee knows instantly: no briefing, no repeating
                yourself.
              </p>
            </div>
          </div>
          <div className="flex -space-x-2 pl-1">
            {EMPLOYEES.filter((e) => !e.comingSoon).map((e) => (
              <EmployeeAvatar
                key={e.role}
                meta={e}
                className="ring-background size-9 rounded-full text-base ring-2"
              />
            ))}
          </div>
        </div>

        <BusinessKnowledge />
        {hasReddit && (
          <>
            <ReplyStyleCard />
            <AutoPostPacingCard />
          </>
        )}

        <p className="text-muted-foreground text-xs">
          Coming soon: upload documents (pitch deck, FAQs, product sheets) to teach the whole team
          at once.
        </p>
      </div>
    </div>
  );
}

const FIELDS: { key: keyof BusinessContext; label: string; hint: string; rows: number }[] = [
  { key: "summary", label: "Summary", hint: "What the business is, in a sentence or two", rows: 2 },
  { key: "what_they_do", label: "What you do", hint: "What you actually sell or offer", rows: 2 },
  { key: "product", label: "Product", hint: "The core product and its value", rows: 2 },
  {
    key: "audience",
    label: "Audience (ICP)",
    hint: "Who your customers are, specifically",
    rows: 2,
  },
  {
    key: "positioning",
    label: "Positioning",
    hint: "How you're different from alternatives",
    rows: 2,
  },
];

function BusinessKnowledge() {
  const { data: ws, isLoading } = useWorkspace();
  const analyze = useAnalyzeWebsite();
  const save = useSaveBusinessContext();

  const [url, setUrl] = useState("");
  const [ctx, setCtx] = useState<BusinessContext>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!ws) return;
    setUrl(ws.website_url ?? "");
    setCtx((ws.business_context as BusinessContext | null) ?? {});
    setDirty(false);
  }, [ws]);

  function setField<K extends keyof BusinessContext>(k: K, v: BusinessContext[K]) {
    setCtx((c) => ({ ...c, [k]: v }));
    setDirty(true);
  }

  function onAnalyze() {
    const u = url.trim();
    if (!u) return;
    analyze.mutate(u, {
      onSuccess: (context) => {
        setCtx(context);
        setDirty(false);
      },
    });
  }

  function onSave() {
    if (!ws) return;
    save.mutate(
      { teamId: ws.id, context: ctx, websiteUrl: url.trim() || undefined },
      { onSuccess: () => setDirty(false) },
    );
  }

  const hasContext = !!(ctx.summary || ctx.what_they_do || ctx.product || ctx.audience);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analyze your website</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Globe className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onAnalyze();
                }}
                placeholder="https://yourcompany.com"
                className="h-10 pl-9"
                disabled={analyze.isPending}
              />
            </div>
            <Button
              className="h-10 sm:w-auto"
              onClick={onAnalyze}
              disabled={analyze.isPending || !url.trim()}
            >
              {analyze.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Reading your site…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Analyze
                </>
              )}
            </Button>
          </div>
          {analyze.isPending && (
            <p className="text-muted-foreground text-xs">
              Sentrive is reading your pages. This can take up to a minute.
            </p>
          )}
          {analyze.isError && (
            <p className="text-destructive flex items-center gap-1.5 text-xs">
              <AlertTriangle className="size-3.5" />
              {(analyze.error as Error).message || "Couldn't analyze that site. Try again."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Business context</CardTitle>
          <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending || !ws}>
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Save
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {!hasContext && (
                <p className="text-muted-foreground text-sm">
                  Nothing yet. Paste your website above and Sentrive will fill this in, or type it
                  in manually.
                </p>
              )}

              {FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1.5">
                  <label htmlFor={`bc-${f.key}`} className="text-sm font-medium">
                    {f.label}
                  </label>
                  <Textarea
                    id={`bc-${f.key}`}
                    value={(ctx[f.key] as string) ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.hint}
                    rows={f.rows}
                    className="resize-y text-sm"
                  />
                </div>
              ))}

              <div className="grid gap-1.5">
                <label htmlFor="bc-voice" className="text-sm font-medium">
                  Voice
                </label>
                <Input
                  id="bc-voice"
                  value={ctx.voice ?? ""}
                  onChange={(e) => setField("voice", e.target.value)}
                  placeholder="e.g. bold, technical, no fluff"
                  className="text-sm"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="bc-keywords" className="text-sm font-medium">
                  Keywords
                </label>
                <Input
                  id="bc-keywords"
                  value={(ctx.keywords ?? []).join(", ")}
                  onChange={(e) =>
                    setField(
                      "keywords",
                      e.target.value
                        .split(",")
                        .map((k) => k.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="comma, separated, themes"
                  className="text-sm"
                />
                {(ctx.keywords ?? []).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(ctx.keywords ?? []).map((k) => (
                      <span
                        key={k}
                        className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/**
 * How the user's Reddit replies should sound. Explicit up-front instructions
 * plus a live count of the drafts they've refined, which Sentrive learns from.
 */
function ReplyStyleCard() {
  const { data: ws } = useWorkspace();
  const update = useUpdateReplyInstructions();
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (ws) {
      setText(ws.reply_instructions ?? "");
      setDirty(false);
    }
  }, [ws]);

  const learned = Array.isArray(ws?.reply_samples) ? ws.reply_samples.length : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4" /> Reddit reply style
        </CardTitle>
        <Button
          size="sm"
          disabled={!dirty || update.isPending || !ws}
          onClick={() =>
            ws &&
            update.mutate(
              { teamId: ws.id, instructions: text.trim() },
              { onSuccess: () => setDirty(false) },
            )
          }
        >
          {update.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Save
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Tell Sentrive how you want your Reddit replies to sound, so drafts match you from the
          start. For example: tone, length, whether to include your link, phrases to use or avoid.
        </p>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
          rows={4}
          placeholder={
            'e.g. "Keep it short and casual, lowercase, no emojis. Mention Sentrive naturally, only drop the link if someone asks for a tool. Never sound salesy."'
          }
          className="resize-y text-sm"
        />
        <div className="flex items-center gap-2 rounded-lg border border-[#3d82f5]/25 bg-[#3d82f5]/5 p-3 text-sm">
          <Sparkles className="size-4 shrink-0 text-[#3d82f5]" />
          <span className="text-muted-foreground">
            {learned > 0 ? (
              <>
                <span className="text-foreground font-medium">
                  Sentrive has learned from {learned} {learned === 1 ? "reply" : "replies"} you
                  refined.
                </span>{" "}
                Every time you edit a draft before posting, it gets a little more like you.
              </>
            ) : (
              <>
                <span className="text-foreground font-medium">Sentrive learns as you go.</span> When
                you edit a draft before posting, it picks up your voice for next time.
              </>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * How fast Auto mode posts Reddit replies. Auto mode never bursts: it drips
 * replies out one at a time, spaced apart, under a daily cap. These are the two
 * knobs, so users can keep it well inside what their account can safely handle.
 */
function AutoPostPacingCard() {
  const { data: ws } = useWorkspace();
  const update = useUpdateAutoPostPacing();
  const [perDay, setPerDay] = useState(10);
  const [gap, setGap] = useState(8);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (ws) {
      setPerDay(ws.auto_post_per_day ?? 10);
      setGap(ws.auto_post_gap_minutes ?? 8);
      setDirty(false);
    }
  }, [ws]);

  const clampedPerDay = Math.max(0, Math.min(100, Math.round(perDay || 0)));
  const clampedGap = Math.max(1, Math.min(240, Math.round(gap || 0)));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" /> Reddit auto-post pacing
        </CardTitle>
        <Button
          size="sm"
          disabled={!dirty || update.isPending || !ws}
          onClick={() =>
            ws &&
            update.mutate(
              { teamId: ws.id, perDay: clampedPerDay, gapMinutes: clampedGap },
              { onSuccess: () => setDirty(false) },
            )
          }
        >
          {update.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Save
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          When Auto mode is on, Sentrive never posts replies all at once, that's how accounts get
          flagged. It spaces them out and drips them to Reddit one at a time. These limits keep it
          gentle; lower them if your account is new.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="ap-per-day" className="text-sm font-medium">
              Max replies per day
            </label>
            <Input
              id="ap-per-day"
              type="number"
              min={0}
              max={100}
              value={perDay}
              onChange={(e) => {
                setPerDay(e.target.valueAsNumber);
                setDirty(true);
              }}
              className="max-w-[9rem] text-sm"
            />
            <p className="text-muted-foreground text-xs">
              A hard ceiling across all your lead agents. Set 0 to pause auto-posting.
            </p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="ap-gap" className="text-sm font-medium">
              Minutes between replies
            </label>
            <Input
              id="ap-gap"
              type="number"
              min={1}
              max={240}
              value={gap}
              onChange={(e) => {
                setGap(e.target.valueAsNumber);
                setDirty(true);
              }}
              className="max-w-[9rem] text-sm"
            />
            <p className="text-muted-foreground text-xs">
              The gap Sentrive waits between posts (it adds a little randomness on top).
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
