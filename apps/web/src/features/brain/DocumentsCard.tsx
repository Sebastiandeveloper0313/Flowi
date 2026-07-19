import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Check, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { useConfirm } from "@/components/useConfirm";
import { formatWhen } from "@/features/tasks/hooks";
import { useActiveTeamId } from "@/features/workspace/active";
import { supabase } from "@/integrations/supabase/client";

// Text-first on purpose: the runner consumes plain text, so we extract in the
// browser and store text. Rich formats can come later without a schema change.
const ACCEPT = ".txt,.md,.markdown,.csv";
const MAX_DOC_CHARS = 20_000;
const MAX_DOCS = 20;

const docKeys = { all: ["team-documents"] as const };

function useTeamDocuments() {
  const teamId = useActiveTeamId();
  return useQuery({
    queryKey: [...docKeys.all, teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_documents")
        .select("id, name, created_at")
        .eq("team_id", teamId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });
}

function useAddDocument() {
  const teamId = useActiveTeamId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, content }: { name: string; content: string }) => {
      const { error } = await supabase.from("team_documents").insert({
        team_id: teamId!,
        name: name.slice(0, 120),
        content: content.slice(0, MAX_DOC_CHARS),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: docKeys.all }),
  });
}

function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: docKeys.all }),
  });
}

/**
 * The Brain's document shelf: drop in the material you'd hand a new hire
 * (pitch notes, FAQs, product sheets) and every employee grounds its work in
 * it from the next run onward.
 */
export function DocumentsCard() {
  const { data: docs, isLoading } = useTeamDocuments();
  const add = useAddDocument();
  const remove = useDeleteDocument();
  const { confirm, dialog } = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const [pasting, setPasting] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const full = (docs?.length ?? 0) >= MAX_DOCS;

  async function onFile(file: File) {
    setError(null);
    if (/\.(pdf|docx?|pptx?)$/i.test(file.name)) {
      setError("PDFs and Office files aren't supported yet. Paste the text instead.");
      return;
    }
    if (file.size > 1_000_000) {
      setError("That file is over 1MB. Paste the part that matters instead.");
      return;
    }
    const content = (await file.text()).trim();
    if (!content) {
      setError("That file looks empty.");
      return;
    }
    add.mutate({ name: file.name.replace(/\.(txt|md|markdown|csv)$/i, ""), content });
  }

  function onPasteSave() {
    const content = text.trim();
    if (!content) return;
    add.mutate(
      { name: name.trim() || "Pasted notes", content },
      {
        onSuccess: () => {
          setPasting(false);
          setName("");
          setText("");
        },
      },
    );
  }

  async function onDelete(id: string, docName: string) {
    const ok = await confirm({
      title: "Remove this document?",
      description: `Your team will stop using “${docName}” from their next run.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok) remove.mutate(id);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" /> Documents
        </CardTitle>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={add.isPending || full}
            onClick={() => setPasting((p) => !p)}
          >
            <Plus className="size-3.5" /> Paste text
          </Button>
          <Button
            size="sm"
            disabled={add.isPending || full}
            onClick={() => fileRef.current?.click()}
          >
            {add.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            Upload file
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Whatever you'd hand a new hire on day one: pitch notes, FAQs, product sheets, pricing.
          Plain text files ({ACCEPT.replaceAll(",", ", ")}) or pasted text; the whole team uses it
          from their next run.
        </p>

        {pasting && (
          <div className="bg-muted/30 grid gap-2 rounded-xl border p-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name it, e.g. Pricing FAQ"
              className="text-sm"
            />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Paste the text here…"
              className="resize-y text-sm"
            />
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPasting(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!text.trim() || add.isPending} onClick={onPasteSave}>
                {add.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Save
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-destructive text-xs">{error}</p>}
        {add.isError && <p className="text-destructive text-xs">{(add.error as Error).message}</p>}
        {full && (
          <p className="text-muted-foreground text-xs">
            That's {MAX_DOCS} documents, the max for now. Remove one to add another.
          </p>
        )}

        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (docs?.length ?? 0) === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Nothing here yet. The first upload instantly makes every employee smarter about you.
          </p>
        ) : (
          <div className="grid gap-2">
            {docs!.map((d) => (
              <div
                key={d.id}
                className="bg-muted/30 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileText className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-muted-foreground text-xs">
                      Added {formatWhen(d.created_at)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => void onDelete(d.id, d.name)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  aria-label={`Remove ${d.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {dialog}
    </Card>
  );
}
