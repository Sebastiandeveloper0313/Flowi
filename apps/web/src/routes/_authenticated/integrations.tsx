import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Check, Plus } from "lucide-react";

import { integrations } from "@/features/dashboard/mock";
import { PageHeader } from "@/features/dashboard/ui";

export const Route = createFileRoute("/_authenticated/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const connected = integrations.filter((i) => i.connected);
  const available = integrations.filter((i) => !i.connected);

  return (
    <div className="flowy-page">
      <PageHeader
        title="Integrations"
        subtitle="Connect the tools your agents act on. Permissions are per-tool and shared across every agent."
      />

      <h2 className="text-muted-foreground mb-3 text-sm font-semibold">
        Connected · {connected.length}
      </h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {connected.map((i) => (
          <Card key={i.key}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-sm font-bold text-white">
                      {i.name.charAt(0)}
                    </span>
                    <div>
                      <div className="font-semibold">{i.name}</div>
                      <div className="text-muted-foreground text-xs">{i.category}</div>
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <Check className="size-3" /> Connected
                </span>
              </div>

              {i.account && (
                <p className="text-muted-foreground mt-3 text-xs">
                  Account: <span className="text-foreground font-medium">{i.account}</span>
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {i.scopes.map((s) => (
                  <span key={s} className="bg-muted rounded-md px-2 py-0.5 text-[0.7rem]">
                    {s}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline">
                  Manage
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
                  Disconnect
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-muted-foreground mb-3 text-sm font-semibold">Available</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {available.map((i) => (
          <Card key={i.key}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2.5">
                <span className="bg-muted text-muted-foreground grid size-9 place-items-center rounded-xl text-sm font-bold">
                  {i.name.charAt(0)}
                </span>
                <div>
                  <div className="text-sm font-semibold">{i.name}</div>
                  <div className="text-muted-foreground text-xs">{i.category}</div>
                </div>
              </div>
              <Button size="sm" variant="outline">
                <Plus className="size-4" /> Connect
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
