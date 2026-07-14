import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Input } from "@workspace/ui/components/input";
import { Check, ChevronsUpDown, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";

import { useConfirm } from "@/components/useConfirm";
import { useSyncWorkspaceBilling } from "@/features/billing/hooks";
import { analyzeWebsite } from "@/features/onboarding/mutations";
import { useDeleteWorkspace } from "@/features/workspace/hooks";
import { track } from "@/integrations/posthog";
import { supabase } from "@/integrations/supabase/client";

import { useActiveWorkspace, type Workspace, workspacesQueryOptions } from "./active";

/** Switch between products (workspaces) or create a new one. Lives under the logo. */
export function WorkspaceSwitcher() {
  const { workspaces, active, setActiveTeamId } = useActiveWorkspace();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  function switchTo(id: string) {
    if (id === active?.id) return;
    setActiveTeamId(id);
    // Land on a workspace-agnostic page so a stale agent/chat view can't 404.
    void navigate({ to: "/dashboard", search: { c: undefined } });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flowy-ws-switch" title="Switch workspace">
            <span className="truncate">{active?.name || "Workspace"}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onSelect={() => switchTo(w.id)}>
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === active?.id && <Check className="size-4 text-[#3d82f5]" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New workspace
          </DropdownMenuItem>
          {workspaces.length > 1 && (
            <DropdownMenuItem onSelect={() => setManageOpen(true)}>
              <Settings2 className="size-4" /> Manage workspaces
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateProductDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ManageWorkspacesDialog open={manageOpen} onOpenChange={setManageOpen} />
    </>
  );
}

/** List the account's workspaces and let the user delete extra ones (not the primary). */
function ManageWorkspacesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspaces, active, primary } = useActiveWorkspace();
  const navigate = useNavigate();
  const del = useDeleteWorkspace();
  const { confirm, dialog } = useConfirm();

  async function onDelete(ws: Workspace) {
    const ok = await confirm({
      title: `Delete ${ws.name}?`,
      description:
        "This permanently removes this workspace and its agents, leads, chats, and drafts, and drops it from your bill. This can't be undone.",
      confirmLabel: "Delete workspace",
      destructive: true,
    });
    if (!ok) return;
    del.mutate(ws.id, {
      onSuccess: () => {
        // If we deleted the workspace we were viewing, land somewhere safe.
        if (active?.id === ws.id) void navigate({ to: "/dashboard", search: { c: undefined } });
      },
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-lg font-bold tracking-tight">Manage workspaces</DialogTitle>
          <p className="text-muted-foreground -mt-2 text-sm">
            Your first workspace holds your plan, so it can't be deleted here. Removing an extra
            workspace deletes it and its agents, and takes it off your bill.
          </p>
          <div className="mt-1 flex flex-col gap-1.5">
            {workspaces.map((ws) => {
              const isPrimary = ws.id === primary?.id;
              return (
                <div
                  key={ws.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <span className="flex-1 truncate text-sm font-medium">
                    {ws.name}
                    {isPrimary && (
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        Primary
                      </span>
                    )}
                  </span>
                  {!isPrimary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={del.isPending}
                      onClick={() => onDelete(ws)}
                    >
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {del.isError && (
            <p className="text-destructive text-sm">
              {(del.error as Error)?.message || "Couldn't delete the workspace. Try again."}
            </p>
          )}
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}

function CreateProductDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setActiveTeamId } = useActiveWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const syncBilling = useSyncWorkspaceBilling();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: teamId, error } = await supabase.rpc("create_workspace", {
        p_name: name.trim() || "New workspace",
        p_website_url: url.trim() || undefined,
      });
      if (error) throw error;
      return teamId as string;
    },
    onSuccess: async (teamId) => {
      track("workspace_created");
      await queryClient.invalidateQueries({ queryKey: workspacesQueryOptions.queryKey });
      // Add this workspace to the subscription (base plan covers only the first).
      // Idempotent and self-healing server-side, so fire and forget.
      syncBilling.mutate();
      setActiveTeamId(teamId);
      // Read the new site into this workspace in the background (scoped by team_id).
      if (url.trim()) {
        void analyzeWebsite({ website_url: url.trim(), team_id: teamId }).then(
          () => queryClient.invalidateQueries({ queryKey: workspacesQueryOptions.queryKey }),
          () => {},
        );
      }
      onOpenChange(false);
      setName("");
      setUrl("");
      void navigate({ to: "/dashboard", search: { c: undefined } });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-lg font-bold tracking-tight">Add a workspace</DialogTitle>
        <p className="text-muted-foreground -mt-2 text-sm">
          Each workspace gets its own website, agents, and leads, kept separate from your others.
          Additional workspaces are <span className="text-foreground font-medium">$39/mo</span>,
          added to your subscription.
        </p>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <label htmlFor="ws-name" className="text-sm font-medium">
              Workspace name
            </label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Analytics"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="ws-url" className="text-sm font-medium">
              Website
            </label>
            <Input
              id="ws-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) create.mutate();
              }}
              placeholder="https://acme.com"
            />
            <p className="text-muted-foreground text-xs">
              Sentrive reads it to learn this business, so its agents sound right from day one.
            </p>
          </div>
          {create.isError && (
            <p className="text-destructive text-sm">
              {(create.error as Error)?.message || "Couldn't create the workspace. Try again."}
            </p>
          )}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" disabled={create.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create workspace · +$39/mo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
