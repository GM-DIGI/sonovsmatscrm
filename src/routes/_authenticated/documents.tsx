import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { docLabel, docStatusLabel, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Documents · SONOV Smart CRM" }] }),
  component: DocumentsPage,
});

type Row = Tables<"documents"> & {
  leads: Pick<Tables<"leads">, "client_name" | "email"> | null;
};

function DocumentsPage() {
  const { role, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (loading) return;
    const load = async () => {
      const { data } = await supabase
        .from("documents")
        .select("*, leads(client_name,email)")
        .order("uploaded_at", { ascending: false });
      setRows((data as Row[]) ?? []);
    };
    load();
    const ch = supabase
      .channel("docs-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading]);

  const statusTone = (s: string) =>
    s === "Approved"
      ? "bg-[color:var(--success)]/15 text-[color:var(--success)] border-[color:var(--success)]/30"
      : s === "Rejected"
        ? "bg-destructive/15 text-destructive border-destructive/30"
        : "bg-muted text-muted-foreground border-border";

  return (
    <AppShell role={role}>
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Tous les fichiers liés aux dossiers visibles selon votre rôle.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{rows.length} fichier(s)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Aucun document pour le moment.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((d) => (
                  <li key={d.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{docLabel(d.document_type)}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {d.leads?.client_name ?? "—"} · {fmtDate(d.uploaded_at)}
                        {d.file_name ? ` · ${d.file_name}` : ""}
                      </div>
                      {d.rejection_reason && (
                        <div className="mt-1 text-xs text-destructive">Motif : {d.rejection_reason}</div>
                      )}
                    </div>
                    <Badge variant="outline" className={statusTone(d.status)}>
                      {docStatusLabel(d.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
