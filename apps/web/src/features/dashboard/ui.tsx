import type { ReactNode } from "react";

import { type AgentStatus, type Channel, CHANNEL_LABELS, type RunStatus } from "./mock";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const map: Record<AgentStatus, { label: string; cls: string; dot: string }> = {
    running: {
      label: "Running",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    },
    paused: {
      label: "Paused",
      cls: "bg-slate-100 text-slate-600 border-slate-200",
      dot: "bg-slate-400",
    },
    needs_input: {
      label: "Needs input",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
    },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      <span
        className={`size-1.5 rounded-full ${s.dot} ${status === "running" ? "animate-pulse" : ""}`}
      />
      {s.label}
    </span>
  );
}

export function RunStatusDot({ status }: { status: RunStatus }) {
  const cls =
    status === "success" ? "bg-emerald-500" : status === "failed" ? "bg-rose-500" : "bg-amber-500";
  return <span className={`inline-block size-2 shrink-0 rounded-full ${cls}`} />;
}

const CHANNEL_GLYPH: Record<Channel, string> = {
  discord: "🎮",
  telegram: "✈️",
  slack: "#",
  whatsapp: "🟢",
  email: "✉️",
  dashboard: "▦",
};

export function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden="true">{CHANNEL_GLYPH[channel]}</span>
      {CHANNEL_LABELS[channel]}
    </span>
  );
}
