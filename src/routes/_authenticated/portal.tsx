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
import { downloadInvoicePdf, downloadStoragePdf } from "@/lib/pdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Lock, FileText, Check, AlertCircle, Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({ meta: [{ title: "Mon parcours · Atrium" }] }),
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
        <div className="grid h-64 place-items-center text-sm text-muted-foreground">Chargement…</div>
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell role={role}>
        <div className="mx-auto max-w-2xl space-y-4 p-8">
          <h1 className="text-2xl font-semibold">Bienvenue chez Atrium</h1>
          <p className="text-muted-foreground">
            Aucun dossier actif n'a été trouvé pour votre adresse e-mail. Votre agent immobilier
            créera votre dossier sous peu — dès qu'il sera prêt, votre parcours personnalisé
            apparaîtra automatiquement ici.
          </p>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-muted">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-sm text-muted-foreground">
                Connecté en tant que <b>{user?.email}</b>. Demandez à votre agent de créer un lead avec cette adresse.
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
            <h1 className="text-2xl font-semibold tracking-tight">Bonjour, {lead.client_name.split(" ")[0]}</h1>
            <p className="text-sm text-muted-foreground">
              Votre parcours personnalisé pour votre futur bien ({lead.property_type.toLowerCase()}).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{lead.property_type}</Badge>
            <Badge>{statusLabel(lead.status)}</Badge>
            {lead.locked && (
              <Badge className="bg-[color:var(--success)] text-[color:var(--success-foreground)]">
                <Lock className="mr-1 h-3 w-3" /> Finalisé
              </Badge>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Votre parcours</CardTitle>
          </CardHeader>
          <CardContent>
            <JourneyStepper status={lead.status} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Documents requis</CardTitle>
              <span className="text-xs text-muted-foreground">
                {docs.filter((d) => d.status === "Approved").length} approuvé(s)
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

        {((lead as any).contract_path || (lead as any).signed_contract_path) && (
          <ContractCard lead={lead} onChange={reload} />
        )}



        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mes factures & documents</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune facture pour le moment.</p>
            ) : (
              <ul className="divide-y divide-border">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">
                          {invoiceTypeLabel(inv.invoice_type)} · <span className="font-mono">{inv.invoice_number}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Émise le {fmtDate(inv.issue_date)} · Échéance {fmtDate(inv.due_date)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        className={cn(
                          inv.status === "Paid" && "bg-[color:var(--success)] text-[color:var(--success-foreground)]",
                        )}
                      >
                        {invoiceStatusLabel(inv.status)}
                      </Badge>
                      <div className="text-sm font-semibold">{fmtMoney(inv.amount)}</div>
                      <Button variant="ghost" size="sm" onClick={() => setPreviewInvoice(inv)}>Voir</Button>
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
            <DialogTitle>Facture</DialogTitle>
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
    toast.success("Document envoyé — votre agent va l'examiner");
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
            <div className="font-medium">{docLabel(type)}</div>
            <div className="text-xs text-muted-foreground">
              {approved
                ? "Approuvé"
                : rejected
                ? `Rejeté — ${latest?.rejection_reason ?? "merci de redéposer"}`
                : latest
                ? "En attente de validation"
                : "Non envoyé"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latest && (
            <Button size="sm" variant="ghost" onClick={() => view(latest.file_path)}>
              Voir
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
                <Upload className="mr-1 h-3.5 w-3.5" /> {latest ? "Redéposer" : "Téléverser"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractCard({ lead, onChange }: { lead: Tables<"leads">; onChange: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const contractPath = (lead as any).contract_path as string | null;
  const signedPath = (lead as any).signed_contract_path as string | null;
  const sentAt = (lead as any).contract_sent_at as string | null;
  const signedAt = (lead as any).contract_signed_at as string | null;

  const onFile = async (file: File | undefined) => {
    if (!file || lead.locked) return;
    setBusy(true);
    const path = `${lead.id}/contract-signed-${Date.now()}-${file.name}`;
    const up = await supabase.storage
      .from("lead-documents")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) {
      setBusy(false);
      return toast.error(up.error.message);
    }
    const { error } = await supabase
      .from("leads")
      .update({
        signed_contract_path: path,
        contract_signed_at: new Date().toISOString(),
      } as never)
      .eq("id", lead.id);
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    if (lead.assigned_agent_id) {
      await supabase.from("notifications").insert({
        user_id: lead.assigned_agent_id,
        lead_id: lead.id,
        title: "Contrat signé reçu",
        message: `${lead.client_name} a renvoyé le contrat signé.`,
      });
    }
    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      kind: "system",
      message: "Le client a renvoyé le contrat signé.",
    });
    setBusy(false);
    toast.success("Contrat signé envoyé à votre agent");
    onChange();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Votre contrat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {contractPath ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Contrat de transaction immobilière</div>
                <div className="text-xs text-muted-foreground">
                  {sentAt ? `Émis le ${fmtDate(sentAt)}` : "Prêt à signer"}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => downloadStoragePdf("lead-documents", contractPath, "contrat-atrium.pdf")}
            >
              <FileText className="mr-1 h-3.5 w-3.5" /> Télécharger
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Votre contrat sera disponible ici dès qu'il sera émis.</p>
        )}

        <div className="rounded-lg border border-dashed border-border bg-card p-4">
          {signedPath ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[color:var(--success)]">
                <Check className="h-4 w-4" />
                <div>
                  <div className="font-medium">Contrat signé envoyé</div>
                  <div className="text-xs opacity-80">
                    {signedAt ? `Reçu le ${fmtDate(signedAt)}` : ""}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => downloadStoragePdf("lead-documents", signedPath, "contrat-signe.pdf")}
              >
                Voir
              </Button>
              {!lead.locked && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> Remplacer
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <div className="font-medium">Renvoyez votre contrat signé</div>
                <div className="text-xs text-muted-foreground">
                  Téléchargez le contrat, signez-le (manuscrit ou électronique), puis téléversez le PDF ici.
                </div>
              </div>
              <Button
                size="sm"
                disabled={busy || !contractPath || lead.locked}
                onClick={() => inputRef.current?.click()}
                className="bg-gradient-brand"
              >
                <Upload className="mr-1 h-3.5 w-3.5" /> Téléverser le signé
              </Button>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            hidden
            accept="application/pdf,image/*"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      </CardContent>
    </Card>
  );
}

