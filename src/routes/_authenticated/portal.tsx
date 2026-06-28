import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { JourneyStepper } from "@/components/JourneyStepper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { REQUIRED_DOCS, fmtDate, fmtMoney, statusLabel, docLabel, docStatusLabel, invoiceStatusLabel, invoiceTypeLabel } from "@/lib/format";
import { BrandedInvoice } from "@/components/BrandedInvoice";
import { downloadInvoicePdf } from "@/lib/pdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Lock, FileText, Check, AlertCircle, Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({ meta: [{ title: "My journey · Atrium" }] }),
  component: PortalPage,
});

function PortalPage() {
  const { user, role, loading } = useAuth();
  const [lead, setLead] = useState<Tables<"leads"> | null>(null);
  const [docs, setDocs] = useState<Tables<"documents">[]>([]);
  const [invoices, setInvoices] = useState<Tables<"invoices">[]>([]);
  const [previewInvoice, setPreviewInvoice] = useState<Tables<"invoices"> | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    const { data: l } = await supabase
      .from("leads")
      .select("*")
      .eq("client_user_id", user.id)
      .maybeSingle();
    setLead(l ?? null);
    if (!l) return;
    const [{ data: d }, { data: i }] = await Promise.all([
      supabase.from("documents").select("*").eq("lead_id", l.id).order("uploaded_at"),
      supabase.from("invoices").select("*").eq("lead_id", l.id).order("created_at", { ascending: false }),
    ]);
    setDocs(d ?? []);
    setInvoices(i ?? []);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    reload();
  }, [loading, reload]);

  useEffect(() => {
    if (!lead) return;
    const ch = supabase
      .channel(`client-${lead.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `id=eq.${lead.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `lead_id=eq.${lead.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `lead_id=eq.${lead.id}` }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [lead, reload]);

  if (loading) {
    return (
      <AppShell role={role}>
        <div className="grid h-64 place-items-center text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell role={role}>
        <div className="mx-auto max-w-2xl space-y-4 p-8">
          <h1 className="text-2xl font-semibold">Welcome to Atrium</h1>
          <p className="text-muted-foreground">
            We couldn't find an active file associated with your email address. Your real estate
            agent will create your file shortly — once they do, your personalised journey will
            appear here automatically.
          </p>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-muted">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-sm text-muted-foreground">
                Signed in as <b>{user?.email}</b>. Ask your agent to create a lead with this email.
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role={role}>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Hello, {lead.client_name.split(" ")[0]}</h1>
            <p className="text-sm text-muted-foreground">
              Your personal journey to {lead.property_type.toLowerCase()} ownership.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{lead.property_type}</Badge>
            <Badge>{lead.status}</Badge>
            {lead.locked && (
              <Badge className="bg-[color:var(--success)] text-[color:var(--success-foreground)]">
                <Lock className="mr-1 h-3 w-3" /> Finalised
              </Badge>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your journey</CardTitle>
          </CardHeader>
          <CardContent>
            <JourneyStepper status={lead.status} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Required documents</CardTitle>
              <span className="text-xs text-muted-foreground">
                {docs.filter((d) => d.status === "Approved").length} approved
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {REQUIRED_DOCS.map((type) => (
              <DocSlot
                key={type}
                docs={docs.filter((d) => d.document_type === type)}
                type={type}
                leadId={lead.id}
                locked={lead.locked}
                onChange={reload}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">My invoices & documents</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">
                          {inv.invoice_type} · <span className="font-mono">{inv.invoice_number}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Issued {fmtDate(inv.issue_date)} · Due {fmtDate(inv.due_date)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        className={cn(
                          inv.status === "Paid" && "bg-[color:var(--success)] text-[color:var(--success-foreground)]",
                        )}
                      >
                        {inv.status}
                      </Badge>
                      <div className="text-sm font-semibold">{fmtMoney(inv.amount)}</div>
                      <Button variant="ghost" size="sm" onClick={() => setPreviewInvoice(inv)}>View</Button>
                      <Button variant="ghost" size="sm" onClick={() => downloadInvoicePdf(inv, lead)}>PDF</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!previewInvoice} onOpenChange={(o) => !o && setPreviewInvoice(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice</DialogTitle>
          </DialogHeader>
          {previewInvoice && <BrandedInvoice invoice={previewInvoice} lead={lead} />}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function DocSlot({
  type,
  docs,
  leadId,
  locked,
  onChange,
}: {
  type: string;
  docs: Tables<"documents">[];
  leadId: string;
  locked: boolean;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const latest = docs[docs.length - 1];
  const approved = docs.some((d) => d.status === "Approved");
  const rejected = !approved && docs.some((d) => d.status === "Rejected");

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const path = `${leadId}/${Date.now()}-${file.name}`;
    const up = await supabase.storage.from("lead-documents").upload(path, file, { contentType: file.type });
    if (up.error) {
      setBusy(false);
      return toast.error(up.error.message);
    }
    const { error } = await supabase.from("documents").insert({
      lead_id: leadId,
      document_type: type as never,
      file_path: path,
      file_name: file.name,
      status: "Pending",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Uploaded — agent will review shortly");
    onChange();
  };

  const view = async (p: string) => {
    const { data, error } = await supabase.storage.from("lead-documents").createSignedUrl(p, 60);
    if (error) return toast.error(error.message);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full text-xs font-semibold",
              approved
                ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
                : rejected
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-muted-foreground",
            )}
          >
            {approved ? <Check className="h-4 w-4" /> : rejected ? <AlertCircle className="h-4 w-4" /> : "?"}
          </div>
          <div>
            <div className="font-medium">{type}</div>
            <div className="text-xs text-muted-foreground">
              {approved
                ? "Approved"
                : rejected
                ? `Rejected — ${latest?.rejection_reason ?? "please re-upload"}`
                : latest
                ? "Awaiting review"
                : "Not uploaded yet"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latest && (
            <Button size="sm" variant="ghost" onClick={() => view(latest.file_path)}>
              View
            </Button>
          )}
          {!locked && !approved && (
            <>
              <input
                ref={inputRef}
                type="file"
                hidden
                accept="application/pdf,image/*"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
                <Upload className="mr-1 h-3.5 w-3.5" /> {latest ? "Re-upload" : "Upload"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
