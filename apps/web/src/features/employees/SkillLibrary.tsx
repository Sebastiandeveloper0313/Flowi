import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { Textarea } from "@workspace/ui/components/textarea";
import { CalendarClock, Check, Loader2, MessageSquare, Plus } from "lucide-react";
import { useState } from "react";

import { useTasks, useUpdateTaskConfig } from "@/features/tasks/hooks";
import { createAgentFromProposal } from "@/features/tasks/mutations";
import { taskKeys } from "@/features/tasks/queries";
import type { Task } from "@/features/tasks/queries";
import { templateToProposal, type AgentTemplate } from "@/features/tasks/templates";
import { useActiveTeamId } from "@/features/workspace/active";
import { track } from "@/integrations/posthog";

import { useCustomAgents } from "./customAgents";
import {
  employeeMeta,
  roleOfTask,
  templatesOfRole,
  type EmployeeMeta,
  type EmployeeRole,
} from "./roles";

/**
 * The employee's skill library: ready-made skills this role can take on, one
 * click each. Skills the employee already runs show as added. Everything here
 * maps to a template that actually works today, so nothing fails on first run.
 */
export function SkillLibraryDialog({
  meta,
  mine,
  open,
  onOpenChange,
  onCustom,
}: {
  meta: EmployeeMeta;
  mine: Task[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hand a custom brief to the employee's chat, which sets it up as a skill. */
  onCustom?: (text: string) => void;
}) {
  const templates = templatesOfRole(meta.role);
  const [custom, setCustom] = useState("");

  // Agents that exist but aren't this employee's yet: hand any of them over
  // without recreating anything.
  const { data: allTasks } = useTasks();
  const { data: customs } = useCustomAgents();
  const reassign = useUpdateTaskConfig();
  const customIds = new Set((customs ?? []).map((c) => c.id));
  const customNameById = new Map((customs ?? []).map((c) => [c.id, c.name]));
  const mineIds = new Set(mine.map((t) => t.id));
  const takeable = (allTasks ?? []).filter((t) => !mineIds.has(t.id));

  function ownerLabel(t: Task): string {
    const r = roleOfTask(t, customIds);
    return customNameById.get(r) ?? employeeMeta(r as EmployeeRole).name;
  }

  function takeOver(t: Task) {
    reassign.mutate({
      id: t.id,
      config: { ...(t.config as Record<string, unknown> | null), role: meta.role },
    });
  }

  // A template counts as added when an agent was created from it (proposal_id
  // stamp) or shares its exact title (pre-stamp agents).
  const addedIds = new Set(
    mine.flatMap((t) => {
      const pid = (t.config as { proposal_id?: string } | null)?.proposal_id;
      return pid ? [pid] : [];
    }),
  );
  const addedTitles = new Set(mine.map((t) => t.title));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle className="text-lg font-bold tracking-tight">
          Give {meta.name} a new agent
        </DialogTitle>
        <p className="text-muted-foreground -mt-2 text-sm">
          Hand {meta.name} an agent you already have, pick a ready-made one, or describe a new job
          in chat.
        </p>

        {takeable.length > 0 && (
          <div className="rounded-xl border p-3">
            <p className="text-sm font-medium">Agents you already have</p>
            <p className="text-muted-foreground mb-2 text-xs">
              Move one to {meta.name}. It keeps running exactly as before.
            </p>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {takeable.map((t) => (
                <div
                  key={t.id}
                  className="hover:bg-muted/40 flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-muted-foreground text-xs">{ownerLabel(t)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={reassign.isPending}
                    onClick={() => takeOver(t)}
                  >
                    Give to {meta.name}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {templates.length > 0 && (
          <p className="text-sm font-medium">Ready-made agents for this role</p>
        )}
        <div className="grid gap-2">
          {templates.map((t) => (
            <SkillRow
              key={t.id}
              template={t}
              owner={meta.role}
              added={addedIds.has(t.id) || addedTitles.has(t.name)}
            />
          ))}
        </div>

        {onCustom && (
          <div className="rounded-xl border border-dashed p-3.5">
            <p className="text-sm font-medium">Something custom</p>
            <p className="text-muted-foreground text-xs">
              Describe the job in your own words. {meta.name} sets it up with you in chat: what it
              does, how often, where results go.
            </p>
            <Textarea
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              rows={2}
              placeholder="e.g. every Friday, write a short changelog post from what we shipped this week"
              className="mt-2.5 resize-none rounded-xl text-sm"
            />
            <Button
              size="sm"
              className="mt-2.5"
              disabled={!custom.trim()}
              onClick={() => onCustom(custom.trim())}
            >
              <MessageSquare className="size-3.5" /> Teach {meta.name} in chat
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SkillRow({
  template: t,
  owner,
  added,
}: {
  template: AgentTemplate;
  /** The employee this library belongs to; added agents become theirs. */
  owner: string;
  added: boolean;
}) {
  const teamId = useActiveTeamId();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState(false);
  const Icon = t.icon;

  const add = useMutation({
    mutationFn: () => createAgentFromProposal(teamId!, { ...templateToProposal(t), role: owner }),
    onSuccess: () => {
      setCreated(true);
      track("employee_skill_added", { template: t.id });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });

  const done = added || created;

  return (
    <div className="bg-muted/30 flex items-start gap-3 rounded-xl border p-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t.name}</p>
        <p className="text-muted-foreground text-sm">{t.tagline}</p>
        <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
          <CalendarClock className="size-3" /> {t.scheduleLabel}
        </p>
        {add.isError && (
          <p className="text-destructive mt-1 text-xs">
            {(add.error as Error)?.message || "Couldn't add it. Try again."}
          </p>
        )}
      </div>
      {done ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          <Check className="size-3" /> Added
        </span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Add
        </Button>
      )}
    </div>
  );
}
