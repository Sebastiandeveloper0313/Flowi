import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AgentProposalInput,
  bulkDeleteTasks,
  createAgentFromProposal,
  createTask,
  deleteTask,
  runTask,
  setTaskStatus,
  updateTaskChannel,
  updateTaskConfig,
  updateTaskSchedule,
} from "./mutations";
import {
  myTeamQueryOptions,
  runsQueryOptions,
  taskKeys,
  taskRunsQueryOptions,
  tasksQueryOptions,
} from "./queries";

export function useMyTeam() {
  return useQuery(myTeamQueryOptions);
}

export function useTasks() {
  return useQuery(tasksQueryOptions);
}

export function useRuns() {
  return useQuery(runsQueryOptions);
}

export function useTaskRuns(taskId: string) {
  return useQuery(taskRunsQueryOptions(taskId));
}

export function useRunTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runTask,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: taskKeys.runs }),
        queryClient.invalidateQueries({ queryKey: taskKeys.all }),
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

function humanizeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hr, dom, mon, dow] = parts;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const time = () => {
    const H = Number(hr);
    const M = Number(min);
    if (Number.isNaN(H) || Number.isNaN(M)) return null;
    const ap = H < 12 ? "AM" : "PM";
    const h12 = ((H + 11) % 12) + 1;
    return `${h12}:${M.toString().padStart(2, "0")} ${ap}`;
  };

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

  const t = /^\d+$/.test(min) && /^\d+$/.test(hr) ? time() : null;
  if (t && dom === "*" && mon === "*") {
    if (dow === "*") return `Every day at ${t}`;
    if (dow === "1-5") return `Every weekday at ${t}`;
    if (/^[0-6]$/.test(dow)) return `Every ${days[Number(dow)]} at ${t}`;
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
