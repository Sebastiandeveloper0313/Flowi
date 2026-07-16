import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Check, Loader2, Mail } from "lucide-react";

import { createAgentFromProposal } from "@/features/tasks/mutations";
import { taskKeys } from "@/features/tasks/queries";
import { useWorkspace } from "@/features/workspace/hooks";
import { track } from "@/integrations/posthog";

/**
 * The Customer Support hiring moment: one clear job (answer the inbox), one
 * click. Creates the inbox-reply agent; the employee page then surfaces the
 * Gmail connect prompt, and the first run starts by itself once connected.
 */
export function SupportHire() {
  const { data: ws } = useWorkspace();
  const queryClient = useQueryClient();

  const hire = useMutation({
    mutationFn: () =>
      createAgentFromProposal(ws!.id, {
        title: "Inbox replies",
        instructions:
          "Check our email inbox for new, unread messages. For each genuine message from a real person that needs a reply (a customer question, a prospect or sales inquiry, a partnership ask), draft a warm, on-brand reply that actually answers them and send it in-thread. Skip newsletters, receipts, notifications, and anything we've already replied to. Keep replies concise and human.",
        channel: "dashboard",
        schedule_cron: "0 9,14 * * 1-5",
        timezone: "UTC",
        kind: "email_responder",
        keywords: [],
        subreddits: [],
      }),
    onSuccess: () => {
      track("employee_hired", { role: "support" });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });

  if (!ws) return null;

  return (
    <div className="bg-card rounded-2xl border p-6 shadow-xs">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef4fd] text-[#1566e6]">
          <Mail className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">One job: no customer waits on your inbox</h2>
          <p className="text-muted-foreground text-sm">
            It reads incoming Gmail on weekdays and drafts an on-brand reply to every genuine
            message: customer questions, sales inquiries, partnership asks. Newsletters and
            notifications are skipped. You approve every reply before it sends.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={hire.isPending} onClick={() => hire.mutate()}>
          {hire.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {hire.isPending ? "Hiring…" : "Hire Support"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Next step is connecting Gmail; it starts on its own after that.
        </p>
      </div>
      {hire.isError && (
        <p className="text-destructive mt-3 text-sm">Couldn't set that up. Try again.</p>
      )}
    </div>
  );
}
