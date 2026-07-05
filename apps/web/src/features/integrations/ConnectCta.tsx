import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Loader2, Plug } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useRunTask } from "@/features/tasks/hooks";

import { useConnectIntegration, useMissingToolkits } from "./hooks";

const TOOLKIT_NAMES: Record<string, string> = {
  reddit: "Reddit",
  gmail: "Gmail",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  slack: "Slack",
  hubspot: "HubSpot",
  googleads: "Google Ads",
  notion: "Notion",
  googlecalendar: "Google Calendar",
};

export function toolkitName(slug: string): string {
  return TOOLKIT_NAMES[slug] ?? slug;
}

/** Same hosted logo set the integrations page uses. */
export function toolkitLogo(slug: string): string {
  return `https://logos.composio.dev/api/${slug}`;
}

/**
 * One-click connect: opens the hosted OAuth flow in a new tab and polls until
 * the toolkit shows as connected, so the user never has to leave the card
 * they're on. Renders nothing once connected.
 */
export function ConnectButton({
  toolkit,
  size = "sm",
  onConnected,
}: {
  toolkit: string;
  size?: "sm" | "default";
  onConnected?: () => void;
}) {
  const [waiting, setWaiting] = useState(false);
  const { missing, loaded } = useMissingToolkits([toolkit], waiting);
  const connect = useConnectIntegration();
  const connected = loaded && missing.length === 0;
  const name = toolkitName(toolkit);

  useEffect(() => {
    if (waiting && connected) {
      setWaiting(false);
      onConnected?.();
    }
  }, [waiting, connected, onConnected]);

  if (connected) return null;

  return (
    <>
      <Button
        size={size}
        disabled={connect.isPending}
        onClick={async () => {
          try {
            const { redirect_url } = await connect.mutateAsync(toolkit);
            window.open(redirect_url, "_blank", "noopener,noreferrer");
            setWaiting(true);
          } catch {
            /* surfaced below via connect.isError */
          }
        }}
      >
        {waiting || connect.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plug className="size-3.5" />
        )}
        {waiting ? `Finish in the ${name} tab…` : `Connect ${name}`}
      </Button>
      {connect.isError && (
        <p className="text-destructive text-xs">
          Couldn't start the {name} connection. Try again or use the{" "}
          <Link to="/integrations" className="underline">
            integrations page
          </Link>
          .
        </p>
      )}
    </>
  );
}

/**
 * Inline callout for an agent whose integrations aren't connected yet. Shows
 * exactly what's missing with a connect button right there, and disappears on
 * its own the moment the connection lands. Pass `autoRunTaskId` for an agent
 * that has never run: its first run starts by itself once the connection this
 * banner was waiting for arrives.
 */
export function ConnectBanner({
  toolkits,
  autoRunTaskId,
}: {
  toolkits: string[];
  autoRunTaskId?: string;
}) {
  const { missing, loaded } = useMissingToolkits(toolkits);
  const run = useRunTask();
  const sawMissing = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    if (!loaded || !autoRunTaskId) return;
    if (missing.length > 0) {
      sawMissing.current = true;
      return;
    }
    // Only fire on the missing -> connected transition this banner witnessed,
    // never on plain page loads of an already-connected agent.
    if (sawMissing.current && !started.current) {
      started.current = true;
      run.mutate(autoRunTaskId);
    }
  }, [loaded, missing.length, autoRunTaskId, run]);

  if (!loaded || missing.length === 0) return null;

  const names = missing.map(toolkitName);
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

  return (
    <div className="bg-card rounded-xl border p-3.5 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 -space-x-1.5">
          {missing.map((slug) => (
            <img
              key={slug}
              src={toolkitLogo(slug)}
              alt={toolkitName(slug)}
              className="ring-border size-9 rounded-lg bg-white object-contain p-1 ring-1"
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Connect {list} so this agent can run</p>
          <p className="text-muted-foreground text-xs">
            {autoRunTaskId
              ? "Takes about 30 seconds, and the first run starts by itself once connected."
              : "Takes about 30 seconds. You approve everything before it posts or replies."}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {missing.map((slug) => (
          <ConnectButton key={slug} toolkit={slug} />
        ))}
      </div>
    </div>
  );
}
