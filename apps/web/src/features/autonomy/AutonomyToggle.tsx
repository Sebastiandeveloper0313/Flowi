import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Check, ChevronDown, ShieldCheck, Zap } from "lucide-react";

import { useAutonomy, useSetAutonomyMode } from "./hooks";
import type { AutonomyMode } from "./queries";

const MODES: { value: AutonomyMode; label: string; hint: string }[] = [
  { value: "ask", label: "Ask", hint: "Approve high-stakes actions first" },
  { value: "auto", label: "Auto", hint: "Sentrive carries them out on its own" },
];

/** Composer control to set how much Sentrive does on its own (ask vs auto). */
export function AutonomyToggle() {
  const { data } = useAutonomy();
  const setMode = useSetAutonomyMode();
  if (!data) return null;

  const isAuto = data.mode === "auto";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition"
          title="How much Sentrive does on its own"
        >
          {isAuto ? <Zap className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
          {isAuto ? "Auto" : "Ask"}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {MODES.map((m) => (
          <DropdownMenuItem
            key={m.value}
            onSelect={() => setMode.mutate({ teamId: data.teamId, mode: m.value })}
            className="flex-col items-start gap-0.5"
          >
            <span className="flex w-full items-center gap-2 font-medium">
              {m.value === "auto" ? (
                <Zap className="size-3.5" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              {m.label}
              {data.mode === m.value && <Check className="ml-auto size-3.5" />}
            </span>
            <span className="text-muted-foreground pl-6 text-xs">{m.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
