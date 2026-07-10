import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { leadKeys } from "@/features/leads/queries";
import { postKeys } from "@/features/posts/queries";
import { slideshowKeys } from "@/features/slideshows/queries";
import { useActiveTeamId } from "@/features/workspace/active";

import {
  type AgentProposalInput,
  type AgentUpdateChanges,
  bulkDeleteTasks,
  createAgentFromProposal,
  createTask,
  deleteTask,
  runTask,
  setTaskStatus,
  updateAgentFields,
  updateTaskAutonomy,
  updateTaskChannel,
  updateTaskConfig,
  updateTaskSchedule,
} from "./mutations";
import { runsQueryOptions, taskKeys, taskRunsQueryOptions, tasksQueryOptions } from "./queries";

/** The active workspace's team id, in the { data } shape callers expect. */
export function useMyTeam() {
  const teamId = useActiveTeamId();
  return { data: teamId } as const;
}

export function useTasks() {
  return useQuery(tasksQueryOptions(useActiveTeamId()));
}

export function useRuns() {
  return useQuery(runsQueryOptions(useActiveTeamId()));
}

export function useTaskRuns(taskId: string) {
  return useQuery(taskRunsQueryOptions(taskId));
}

export function useRunTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runTask,
    // A run can surface new leads (reddit_monitor) or a new post draft
    // (reddit_post), so refresh those too, or the Leads/Posts panel keeps showing
    // its stale cache until a manual reload.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: taskKeys.runs }),
        queryClient.invalidateQueries({ queryKey: taskKeys.all }),
        queryClient.invalidateQueries({ queryKey: leadKeys.all }),
        queryClient.invalidateQueries({ queryKey: postKeys.all }),
        queryClient.invalidateQueries({ queryKey: slideshowKeys.all }),
      ]),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useCreateAgentFromProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, proposal }: { teamId: string; proposal: AgentProposalInput }) =>
      createAgentFromProposal(teamId, proposal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

/** Set one agent's own Auto/Ask override. */
export function useUpdateTaskAutonomy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: "ask" | "auto" | null }) =>
      updateTaskAutonomy(id, mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

/** Apply a confirmed chat edit to an existing agent. */
export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, changes }: { agentId: string; changes: AgentUpdateChanges }) =>
      updateAgentFields(agentId, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "paused" }) =>
      setTaskStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useBulkDeleteTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkDeleteTasks(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useUpdateTaskSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scheduleCron }: { id: string; scheduleCron: string | null }) =>
      updateTaskSchedule(id, scheduleCron),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useUpdateTaskChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, channel }: { id: string; channel: string }) =>
      updateTaskChannel(id, channel),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useUpdateTaskConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: Record<string, unknown> }) =>
      updateTaskConfig(id, config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

/* ---- schedule + channel presets ---- */
export const SCHEDULES = [
  { value: "0 8 * * 1-5", label: "Every weekday at 8:00 AM" },
  { value: "0 12 * * *", label: "Every day at noon" },
  { value: "0 9 * * 1", label: "Every Monday at 9:00 AM" },
  { value: "0 * * * *", label: "Every hour" },
  { value: "once", label: "Just once" },
] as const;

// Only channels that actually deliver. More (Slack, Discord, WhatsApp) come
// once the backend is publicly reachable for their webhooks.
export const CHANNELS = [
  { value: "dashboard", label: "Dashboard only" },
  { value: "email", label: "Email me the result" },
] as const;

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Expand a cron field like "1,3,5", "1-5", or "9" into a sorted number list; null if it isn't a plain list/range within [lo, hi]. */
function cronList(field: string, lo: number, hi: number): number[] | null {
  const out: number[] = [];
  for (const chunk of field.split(",")) {
    const range = chunk.match(/^(\d+)-(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a > b) return null;
      for (let i = a; i <= b; i++) out.push(i);
    } else if (/^\d+$/.test(chunk)) {
      out.push(Number(chunk));
    } else {
      return null;
    }
  }
  const uniq = [...new Set(out)];
  if (!uniq.length || uniq.some((n) => n < lo || n > hi)) return null;
  return uniq.sort((a, b) => a - b);
}

/** "a", "a and b", "a, b and c". */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function fmtTime(h: number, m: number): string {
  const ap = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12} ${ap}` : `${h12}:${m.toString().padStart(2, "0")} ${ap}`;
}

function humanizeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hr, dom, mon, dow] = parts;

  if (min === "0" && hr === "*" && dom === "*" && mon === "*" && dow === "*") return "Every hour";
  if (/^\d+$/.test(min) && hr === "*" && dom === "*" && mon === "*" && dow === "*")
    return `Hourly at :${min.padStart(2, "0")}`;

  // Every N hours: "0 */3 * * *" -> "Every 3 hours".
  const hStep = hr.match(/^\*\/(\d+)$/);
  if (min === "0" && hStep && dom === "*" && mon === "*" && dow === "*") {
    const n = Number(hStep[1]);
    return n <= 1 ? "Every hour" : `Every ${n} hours`;
  }
  // Every N minutes: "*/15 * * * *" -> "Every 15 minutes".
  const mStep = min.match(/^\*\/(\d+)$/);
  if (mStep && hr === "*" && dom === "*" && mon === "*" && dow === "*") {
    const n = Number(mStep[1]);
    return n <= 1 ? "Every minute" : `Every ${n} minutes`;
  }

  // Fixed minute, one or more specific hours, on a set of weekdays (or every day):
  // "0 15 * * 1,3,5" -> "Mon, Wed and Fri at 3 PM"; "0 10,16 * * *" -> "Every day at 10 AM and 4 PM".
  if (dom === "*" && mon === "*" && /^\d+$/.test(min)) {
    const hours = cronList(hr, 0, 23);
    const m = Number(min);
    if (hours) {
      const times = `at ${joinWords(hours.map((h) => fmtTime(h, m)))}`;
      let dayPhrase: string | null = null;
      if (dow === "*") {
        dayPhrase = "Every day";
      } else {
        const raw = cronList(dow, 0, 7);
        if (raw) {
          const norm = [...new Set(raw.map((d) => (d === 7 ? 0 : d)))].sort((a, b) => a - b);
          const set = new Set(norm);
          if (norm.length === 7) dayPhrase = "Every day";
          else if (norm.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d)))
            dayPhrase = "Weekdays";
          else if (norm.length === 2 && set.has(0) && set.has(6)) dayPhrase = "Weekends";
          else if (norm.length === 1) dayPhrase = `Every ${DAY_FULL[norm[0]]}`;
          else dayPhrase = joinWords(norm.map((d) => DAY_ABBR[d]));
        }
      }
      if (dayPhrase) return `${dayPhrase} ${times}`;
    }
  }

  return cron;
}

export function scheduleLabel(cron: string | null): string {
  if (!cron) return "Just once";
  return SCHEDULES.find((s) => s.value === cron)?.label ?? humanizeCron(cron);
}

export function channelLabel(channel: string): string {
  return CHANNELS.find((c) => c.value === channel)?.label ?? channel;
}

/** Friendly absolute timestamp, e.g. "Jun 26, 2:05 PM". */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
