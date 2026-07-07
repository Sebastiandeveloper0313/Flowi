import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Tables } from "@workspace/supabase/types";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type Workspace = Tables<"teams">;

const ACTIVE_KEY = "sentrive.active_team";

/** Every workspace (product) the user belongs to, oldest first (primary first). */
export const workspacesQueryOptions = queryOptions({
  queryKey: ["workspaces"] as const,
  queryFn: async (): Promise<Workspace[]> => {
    const { data, error } = await supabase.from("team_members").select("teams(*)");
    if (error) throw error;
    return (data ?? [])
      .map((r) => r.teams as Workspace | null)
      .filter((t): t is Workspace => !!t)
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  },
  staleTime: 60_000,
});

interface ActiveWorkspaceValue {
  workspaces: Workspace[];
  /** The user's first workspace: holds the subscription and one-time onboarding. */
  primary: Workspace | null;
  /** The selected workspace: scopes all data (agents, leads, context, replies). */
  active: Workspace | null;
  activeTeamId: string | null;
  setActiveTeamId: (id: string) => void;
  isLoading: boolean;
}

const Ctx = createContext<ActiveWorkspaceValue | null>(null);

export function ActiveWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { data: workspaces = [], isLoading } = useQuery(workspacesQueryOptions);
  const [stored, setStored] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });

  // The active id is the stored one when it's still a workspace the user has,
  // otherwise the primary (first). Never points at a workspace they lost access to.
  const activeTeamId = useMemo(() => {
    if (!workspaces.length) return null;
    return stored && workspaces.some((w) => w.id === stored) ? stored : workspaces[0].id;
  }, [workspaces, stored]);

  useEffect(() => {
    if (activeTeamId && activeTeamId !== stored) {
      setStored(activeTeamId);
      try {
        localStorage.setItem(ACTIVE_KEY, activeTeamId);
      } catch {
        /* ignore */
      }
    }
  }, [activeTeamId, stored]);

  const value: ActiveWorkspaceValue = {
    workspaces,
    primary: workspaces[0] ?? null,
    active: workspaces.find((w) => w.id === activeTeamId) ?? null,
    activeTeamId,
    setActiveTeamId: (id: string) => {
      setStored(id);
      try {
        localStorage.setItem(ACTIVE_KEY, id);
      } catch {
        /* ignore */
      }
    },
    isLoading,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveWorkspace(): ActiveWorkspaceValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useActiveWorkspace must be used within ActiveWorkspaceProvider");
  return c;
}

/** The active workspace's team id, or null before workspaces load. */
export function useActiveTeamId(): string | null {
  return useActiveWorkspace().activeTeamId;
}
