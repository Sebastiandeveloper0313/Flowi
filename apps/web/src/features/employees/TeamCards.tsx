import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { ArrowRight, Loader2, Plus, Shuffle, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { useApprovals } from "@/features/approvals/hooks";
import { DESK_DRAFT_KEY, prefillChat } from "@/features/chat/Chat";
import { useMissingToolkits } from "@/features/integrations/hooks";
import { usePendingLeadReplies } from "@/features/leads/hooks";
import { formatWhen, useRuns, useTasks, useUpdateTaskConfig } from "@/features/tasks/hooks";
import type { Task } from "@/features/tasks/queries";
import { requiredToolkits } from "@/features/tasks/requirements";
import { useActiveTeamId } from "@/features/workspace/active";

import {
  customAgentMeta,
  randomCharacterAvatar,
  uploadAgentAvatar,
  useCreateCustomAgent,
  useCustomAgents,
} from "./customAgents";
import { EmployeeAvatar } from "./EmployeeAvatar";
import {
  EMPLOYEES,
  employeeMeta,
  roleOfTask,
  starterTemplatesOf,
  tasksOfRole,
  type EmployeeMeta,
  type EmployeeRole,
} from "./roles";

/**
 * The roster, in two layers: YOUR agents first (anything with skills, plus
 * every agent you created), then the ready-made catalog underneath as an
 * offer. A working agent reads like a person at work (status, last worked,
 * what's waiting); catalog cards are pre-briefed hires one click away.
 */
export function TeamCards() {
  const { data: tasks } = useTasks();
  const { data: customs } = useCustomAgents();

  const customIds = new Set((customs ?? []).map((c) => c.id));
  const roster = [...EMPLOYEES, ...(customs ?? []).map(customAgentMeta)];
  const cards = roster.map((meta) => ({
    meta,
    mine: tasksOfRole(tasks ?? [], meta.role, customIds),
  }));

  // YOUR agents: anything actually working for you (plus your own creations).
  // The unhired ready-mades are a catalog below, offered, never imposed: a
  // team that only wants its own agents never has ours in their roster.
  const active = cards.filter((c) => c.mine.length > 0 || c.meta.custom);
  const catalog = cards.filter((c) => !(c.mine.length > 0 || c.meta.custom));
  const empty = active.length === 0;

  // Nothing running yet: show only what can actually be hired today, and skip
  // the "new employee" door (you don't need a manager before you have agents).
  const offered = empty ? catalog.filter((c) => !c.meta.comingSoon) : catalog;

  return (
    <div className="space-y-10">
      {!empty && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map(({ meta, mine }) => (
            <EmployeeCard key={meta.role} meta={meta} mine={mine} />
          ))}
          <NewAgentCard />
        </div>
      )}

      {offered.length > 0 && (
        <div>
          {!empty && (
            <>
              <h3 className="text-sm font-semibold">Ready-made employees</h3>
              <p className="text-muted-foreground mb-4 text-sm">
                Pre-briefed on your business. Hire one and they start today, or ignore them and
                build your own.
              </p>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offered.map(({ meta, mine }) => (
              <EmployeeCard key={meta.role} meta={meta} mine={mine} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Creating an employee is a structural act, so it's a form, not a chat: name
 * them, describe the area, and check off which of your existing agents they
 * take over (their docs and reports then cover those agents). Chat stays one
 * click away for people who'd rather describe the role in words.
 */
function NewAgentCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:border-primary/40 hover:text-foreground flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-sm font-medium transition"
      >
        <Plus className="size-5" />
        New employee
        <span className="text-muted-foreground text-xs font-normal">
          Put someone in charge of a group of agents
        </span>
      </button>
      {open && <NewEmployeeDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

function NewEmployeeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: tasks } = useTasks();
  const { data: customs } = useCustomAgents();
  const create = useCreateCustomAgent();
  const reassign = useUpdateTaskConfig();
  const navigate = useNavigate();
  const teamId = useActiveTeamId();

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [duties, setDuties] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // They start with one of the shipped characters, so a new employee looks
  // like part of the cast immediately; shuffle or upload to change it.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => randomCharacterAvatar());
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickImage(file: File) {
    if (!teamId) return;
    setError(null);
    setUploading(true);
    try {
      setAvatarUrl(await uploadAgentAvatar(teamId, file));
    } catch (e) {
      setError((e as Error).message || "Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  }

  const customIds = new Set((customs ?? []).map((c) => c.id));
  const customNameById = new Map((customs ?? []).map((c) => [c.id, c.name]));
  function ownerLabel(t: Task): string {
    const r = roleOfTask(t, customIds);
    if (!r) return "Independent";
    return customNameById.get(r) ?? employeeMeta(r as EmployeeRole).name;
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onCreate() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const agent = await create.mutateAsync({
        name: name.trim(),
        emoji: "",
        title: title.trim() || "Custom role",
        duties: duties.trim(),
        avatarUrl,
      });
      for (const id of selected) {
        const t = (tasks ?? []).find((x) => x.id === id);
        if (!t) continue;
        await reassign.mutateAsync({
          id,
          config: { ...(t.config as Record<string, unknown> | null), role: agent.id },
        });
      }
      onOpenChange(false);

      // An employee with no agents does NOTHING, so never leave them empty
      // holding a job description: hand the duties straight to their chat,
      // which proposes the first real agent for one-click confirm.
      const needsFirstAgent = selected.size === 0 && duties.trim().length > 0;
      if (needsFirstAgent) {
        try {
          sessionStorage.setItem(
            DESK_DRAFT_KEY,
            `Set this up as my first recurring agent: ${duties.trim()}`,
          );
        } catch {
          /* storage blocked: they land on an empty chat, nothing lost */
        }
      }
      void navigate({
        to: "/team/$role",
        params: { role: agent.id },
        search: needsFirstAgent ? { tab: "chat" } : undefined,
      });
    } catch (e) {
      setError((e as Error).message || "Couldn't create the employee. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function describeInChat() {
    onOpenChange(false);
    prefillChat("Hire a new employee to handle ");
    void navigate({ to: "/dashboard", search: { c: undefined } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New employee</DialogTitle>
          <DialogDescription>
            They manage the agents you assign them: you check one desk and chat with one person
            instead of opening every agent yourself.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {/* The live tile: exactly what the roster will render. */}
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="ring-border size-14 shrink-0 rounded-2xl bg-white object-cover ring-1"
              />
            ) : (
              <span className="bg-muted/40 ring-border grid size-14 shrink-0 place-items-center rounded-2xl text-xl font-semibold ring-1">
                {(name.trim()[0] ?? "?").toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickImage(f);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAvatarUrl(randomCharacterAvatar(avatarUrl))}
                >
                  <Shuffle className="size-3.5" /> Shuffle
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  Upload your own
                </Button>
              </div>
              <p className="text-muted-foreground mt-1.5 text-xs">
                Shuffle through the character set, or upload your own picture.
              </p>
            </div>
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Kim"
            className="text-sm"
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Role, e.g. Ads Manager"
            className="text-sm"
          />
          <Textarea
            value={duties}
            onChange={(e) => setDuties(e.target.value)}
            rows={3}
            placeholder="What's their area? e.g. find leads on Reddit and draft replies that win customers"
            className="resize-y text-sm"
          />
          {duties.trim() && selected.size === 0 && (
            <p className="text-muted-foreground -mt-1 text-xs">
              An employee only runs the agents they own, so {name.trim() || "they"} will set this up
              as their first agent with you right after this.
            </p>
          )}

          {(tasks ?? []).length > 0 && (
            <div className="rounded-xl border p-3">
              <p className="text-sm font-medium">Assign existing agents</p>
              <p className="text-muted-foreground mb-2 text-xs">
                Check the agents this employee takes over. They keep running exactly as before.
              </p>
              <div className="max-h-44 space-y-1 overflow-y-auto">
                {(tasks ?? []).map((t) => (
                  <label
                    key={t.id}
                    className="hover:bg-muted/40 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5"
                  >
                    <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">{ownerLabel(t)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}
          <Button disabled={!name.trim() || busy} onClick={() => void onCreate()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Create {name.trim() || "employee"}
            {selected.size > 0 && ` with ${selected.size} agent${selected.size === 1 ? "" : "s"}`}
          </Button>
          <button
            type="button"
            onClick={describeInChat}
            className="text-muted-foreground hover:text-foreground text-center text-xs font-medium"
          >
            Prefer words? Describe the role in chat instead
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "green" | "amber" | "gray" | "blue" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : tone === "blue"
          ? "bg-[#eef4fd] text-[#1566e6]"
          : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function EmployeeCard({ meta, mine }: { meta: EmployeeMeta; mine: Task[] }) {
  const { data: runs } = useRuns();
  const { data: approvals } = useApprovals();
  const { data: leadGroups } = usePendingLeadReplies();

  const hired = mine.length > 0;
  const ids = new Set(mine.map((t) => t.id));
  const active = mine.filter((t) => t.status === "active");
  const needed = [...new Set(active.flatMap((t) => requiredToolkits(t)))];
  const { missing, loaded } = useMissingToolkits(needed);

  const lastRun = (runs ?? []).find((r) => ids.has(r.task_id));
  const waiting =
    (approvals ?? []).filter((a) => a.status === "pending" && a.task_id && ids.has(a.task_id))
      .length +
    (leadGroups ?? []).filter((g) => ids.has(g.taskId)).reduce((s, g) => s + g.count, 0);

  const status = meta.comingSoon
    ? ({ label: "Coming soon", tone: "gray" } as const)
    : // A created employee with no agents runs nothing: say so, don't imply idle calm.
      meta.custom && !hired
      ? ({ label: "No agents yet", tone: "amber" } as const)
      : !hired
        ? ({ label: "Available", tone: "blue" } as const)
        : loaded && missing.length > 0
          ? ({ label: "Setup needed", tone: "amber" } as const)
          : active.length > 0
            ? ({ label: "Working", tone: "green" } as const)
            : ({ label: "Paused", tone: "gray" } as const);

  // One quiet line under the header; anything actionable gets its own accent
  // line, everything else stays out of the card.
  // An unhired ready-made employee arrives WITH working agents: say which, so
  // "what do I actually get?" is answered before the click.
  const starters = starterTemplatesOf(meta);
  const metaLine = meta.comingSoon
    ? meta.blurb
    : !hired
      ? starters.length > 0
        ? `Starts with ${starters.length} agent${starters.length === 1 ? "" : "s"}: ${starters.map((s) => s.name).join(", ")}`
        : meta.blurb
      : lastRun
        ? `${mine.length} agent${mine.length === 1 ? "" : "s"} · worked ${formatWhen(lastRun.created_at)}`
        : `${mine.length} agent${mine.length === 1 ? "" : "s"} · no runs yet`;

  const body = (
    <>
      <div className="flex items-center gap-4">
        <EmployeeAvatar meta={meta} className="size-14 rounded-2xl text-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold">{meta.name}</span>
            <StatusChip label={status.label} tone={status.tone} />
          </div>
          <p className="text-muted-foreground truncate text-sm">{meta.title}</p>
        </div>
        {!meta.comingSoon && hired && (
          <ArrowRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
        )}
      </div>

      <div className="flex min-h-8 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Never cut the "what you actually get" line mid-word. */}
          <p className="text-muted-foreground line-clamp-2 text-sm">{metaLine}</p>
          {hired && waiting > 0 && (
            <p className="text-primary mt-0.5 text-sm font-medium">{waiting} waiting for your OK</p>
          )}
        </div>
        {!meta.comingSoon && !hired && !meta.custom && (
          <Button size="sm" className="pointer-events-none shrink-0" tabIndex={-1}>
            Hire {meta.name}
          </Button>
        )}
      </div>
    </>
  );

  if (meta.comingSoon) {
    return (
      <div className="bg-card/60 flex flex-col gap-4 rounded-2xl border border-dashed p-6 opacity-80">
        {body}
      </div>
    );
  }

  return (
    <Link
      to="/team/$role"
      params={{ role: meta.role }}
      className="bg-card hover:border-primary/40 group flex flex-col gap-4 rounded-2xl border p-6 shadow-xs transition"
    >
      {body}
    </Link>
  );
}
