import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { ArrowLeft, BookOpen, Globe, MessageSquare, Plug, Sparkles } from "lucide-react";

import { PageHeader } from "@/features/dashboard/ui";
import { EmployeeAvatar } from "@/features/employees/EmployeeAvatar";
import { EMPLOYEES } from "@/features/employees/roles";
import { toolkitLogo, toolkitName } from "@/features/integrations/ConnectCta";
import { useIntegrations } from "@/features/integrations/hooks";
import type { BusinessContext } from "@/features/onboarding/mutations";
import { useWorkspace } from "@/features/workspace/hooks";

export const Route = createFileRoute("/_authenticated/brain")({
  component: BrainPage,
});

/**
 * The shared brain: everything Sentrive knows about the business, in one
 * place. Every employee draws from this, so it doubles as the answer to "how
 * do they know what to write?" and as the reason the workspace gets more
 * valuable the longer it's used.
 */
function BrainPage() {
  const { data: ws } = useWorkspace();
  const { data: toolkits } = useIntegrations();

  const ctx = ((ws?.business_context as BusinessContext | null) ?? {}) as BusinessContext;
  const learned = Array.isArray(ws?.reply_samples) ? ws.reply_samples.length : 0;
  const connected = (toolkits ?? []).filter((t) => t.connected);
  const hasProfile = Boolean(ctx.summary || ctx.what_they_do || ctx.product);

  return (
    <div className="flowy-page">
      <Link
        to="/team"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Your team
      </Link>

      <PageHeader
        title="What your team knows"
        subtitle="One shared brain. Every employee works from it, and it gets sharper the longer they work for you."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* The business profile: who you are, learned from your website. */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4" /> Your business
            </CardTitle>
            <Link to="/settings" className="text-primary text-sm font-medium hover:underline">
              Edit
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {ws?.website_url && (
              <a
                href={ws.website_url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 text-sm"
              >
                <Globe className="size-3.5" /> {ws.website_url.replace(/^https?:\/\//, "")}
              </a>
            )}
            {hasProfile ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <BrainFact label="What you do" value={ctx.what_they_do ?? ctx.summary} />
                <BrainFact label="Product" value={ctx.product} />
                <BrainFact label="Who buys it" value={ctx.audience} />
                <BrainFact label="Positioning" value={ctx.positioning} />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing here yet. Add your website in Settings and Sentrive reads it to brief the
                whole team.
              </p>
            )}
            {(ctx.keywords?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ctx.keywords!.slice(0, 12).map((k) => (
                  <span
                    key={k}
                    className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Voice: explicit rules plus what it learned from real edits. */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-4" /> Your voice
            </CardTitle>
            <Link to="/settings" className="text-primary text-sm font-medium hover:underline">
              Edit
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {ctx.voice && <BrainFact label="How you sound" value={ctx.voice} />}
            {ws?.reply_instructions ? (
              <BrainFact label="Your reply rules" value={ws.reply_instructions} />
            ) : (
              !ctx.voice && (
                <p className="text-muted-foreground text-sm">
                  No voice rules yet. Set them in Settings, or just edit drafts: every edit teaches
                  the team how you actually talk.
                </p>
              )
            )}
            <p className="text-primary flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-3.5" />
              {learned > 0
                ? `Learned from ${learned} repl${learned === 1 ? "y" : "ies"} you edited`
                : "Edits you make to drafts are learned automatically"}
            </p>
          </CardContent>
        </Card>

        {/* The hands: what the team can act through. */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="size-4" /> Connected tools
            </CardTitle>
            <Link to="/integrations" className="text-primary text-sm font-medium hover:underline">
              Manage
            </Link>
          </CardHeader>
          <CardContent>
            {connected.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {connected.map((t) => (
                  <span
                    key={t.slug}
                    className="bg-muted/40 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                  >
                    <img
                      src={toolkitLogo(t.slug)}
                      alt=""
                      className="size-5 rounded bg-white object-contain"
                    />
                    {toolkitName(t.slug)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing connected yet. Each tool you connect gives the whole team another place they
                can work.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Who's drawing on all of this. */}
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {EMPLOYEES.filter((e) => !e.comingSoon).map((e) => (
                  <EmployeeAvatar
                    key={e.role}
                    meta={e}
                    className="ring-background size-9 rounded-full text-base ring-2"
                  />
                ))}
              </div>
              <p className="text-muted-foreground text-sm">
                Everyone on your team works from this brain: no briefing, no repeating yourself.
              </p>
            </div>
            <p className="text-muted-foreground text-xs">
              Coming soon: upload documents (pitch deck, FAQs, product sheets) to teach the whole
              team at once.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BrainFact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}
