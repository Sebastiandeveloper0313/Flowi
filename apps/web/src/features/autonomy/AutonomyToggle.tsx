import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Check, ChevronDown, Send, ShieldCheck, Zap } from "lucide-react";
import { useState } from "react";

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
  const [confirmAuto, setConfirmAuto] = useState(false);
  if (!data) return null;

  const isAuto = data.mode === "auto";

  function choose(mode: AutonomyMode) {
    if (!data) return;
    // Turning auto ON is the consequential direction, so confirm it first.
    // Turning it back to Ask is always safe, apply immediately.
    if (mode === "auto" && data.mode !== "auto") {
      setConfirmAuto(true);
      return;
    }
    setMode.mutate({ teamId: data.teamId, mode });
  }

  return (
    <>
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
              onSelect={() => choose(m.value)}
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

      <Dialog open={confirmAuto} onOpenChange={setConfirmAuto}>
        <DialogContent className="sm:max-w-md">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#ea580c] text-white">
              <Zap className="size-4.5" />
            </span>
            <DialogTitle className="text-lg font-bold tracking-tight">
              Turn on Auto mode?
            </DialogTitle>
          </div>
          <p className="text-muted-foreground text-sm">
            In Auto mode, Sentrive acts on its own, without waiting for you on the Approvals page:
          </p>
          <ul className="space-y-2.5 py-1 text-sm">
            <li className="flex items-start gap-2.5">
              <Send className="mt-0.5 size-4 shrink-0 text-[#ea580c]" />
              <span>
                <span className="font-medium">Reddit replies post automatically</span> from your
                connected account when your lead agents run (up to a few per run).
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#ea580c]" />
              <span>
                <span className="font-medium">Other high-stakes actions run immediately</span> too,
                so nothing waits for your approval.
              </span>
            </li>
          </ul>
          <p className="text-muted-foreground text-xs">
            These posts are public and go out as you. You can switch back to Ask anytime.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmAuto(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setMode.mutate({ teamId: data.teamId, mode: "auto" });
                setConfirmAuto(false);
              }}
            >
              <Zap className="size-4" /> Turn on Auto
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
