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
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { analyzeWebsite } from "@/features/onboarding/mutations";
import { track } from "@/integrations/posthog";
import { supabase } from "@/integrations/supabase/client";

import { useActiveWorkspace, workspacesQueryOptions } from "./active";

/** Switch between products (workspaces) or create a new one. Lives under the logo. */
export function WorkspaceSwitcher() {
  const { workspaces, active, setActiveTeamId } = useActiveWorkspace();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

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
          <button type="button" className="flowy-ws-switch" title="Switch product">
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
            <Plus className="size-4" /> New product
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateProductDialog open={createOpen} onOpenChange={setCreateOpen} />
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
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: teamId, error } = await supabase.rpc("create_workspace", {
        p_name: name.trim() || "New product",
        p_website_url: url.trim() || undefined,
      });
      if (error) throw error;
      return teamId as string;
    },
    onSuccess: async (teamId) => {
      track("workspace_created");
      await queryClient.invalidateQueries({ queryKey: workspacesQueryOptions.queryKey });
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
        <DialogTitle className="text-lg font-bold tracking-tight">Add a product</DialogTitle>
        <p className="text-muted-foreground -mt-2 text-sm">
          Each product gets its own website, agents, and leads, kept separate from your others.
        </p>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <label htmlFor="ws-name" className="text-sm font-medium">
              Product name
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
              Sentrive reads it to learn this product, so its agents sound right from day one.
            </p>
          </div>
          {create.isError && (
            <p className="text-destructive text-sm">
              {(create.error as Error)?.message || "Couldn't create the product. Try again."}
            </p>
          )}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" disabled={create.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create product
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
