import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Check, CheckCheck, X } from "lucide-react";
import { useState } from "react";

import { approvals } from "@/features/dashboard/mock";
import { PageHeader } from "@/features/dashboard/ui";

export const Route = createFileRoute("/_authenticated/approvals")({
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const [resolved, setResolved] = useState<Record<string, "approved" | "rejected">>({});
  const pending = approvals.filter((a) => !resolved[a.id]);

  return (
    <div className="flowy-page">
      <PageHeader
        title="Approvals"
        subtitle="Nothing happens behind your back. Anything an agent needs a yes for waits here."
      />

      {pending.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCheck className="size-6" />
            </span>
            <p className="font-medium">You're all caught up</p>
            <p className="text-muted-foreground text-sm">No agents are waiting on your approval.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {approvals.map((a) => {
            const state = resolved[a.id];
            return (
              <Card key={a.id} className={state ? "opacity-60" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to="/agents/$agentId"
                      params={{ agentId: a.agentId }}
                      className="hover:text-primary text-sm font-medium"
                    >
                      {a.agentName}
                    </Link>
                    <span className="text-muted-foreground text-xs">{a.at}</span>
                  </div>
                  <h3 className="mt-1.5 font-semibold">{a.request}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{a.detail}</p>

                  <div className="mt-4 flex items-center gap-2">
                    {state ? (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          state === "approved"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {state === "approved" ? "Approved" : "Rejected"}
                      </span>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          onClick={() => setResolved((r) => ({ ...r, [a.id]: "approved" }))}
                        >
                          <Check className="size-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResolved((r) => ({ ...r, [a.id]: "rejected" }))}
                        >
                          <X className="size-4" /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
