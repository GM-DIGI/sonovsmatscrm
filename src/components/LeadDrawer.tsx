import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  REQUIRED_DOCS,
  STATUSES,
  fmtDate,
  fmtMoney,
  statusLabel,
  docLabel,
  docStatusLabel,
  invoiceStatusLabel,
  invoiceTypeLabel,
} from "@/lib/format";
import { BrandedInvoice } from "./BrandedInvoice";
import { downloadInvoicePdf, generateAndUploadInvoicePdf } from "@/lib/pdf";
import { toast } from "sonner";
import { Check, X, Send, FileText, MessageCircle, Lock, PartyPopper, ExternalLink, Loader2, Mail } from "lucide-react";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { inviteClientForLead } from "@/lib/admin.functions";

type Lead = Tables<"leads">;
type Doc = Tables<"documents">;
type Activity = Tables<"lead_activities">;
type Invoice = Tables<"invoices">;

export function LeadDrawer({
  lead,
  open,
  onClose,
  isStaff,
}: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  isStaff: boolean;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    if (!lead) return;
    const load = async () => {
      const [d, a, i] = await Promise.all([
        supabase.from("documents").select("*").eq("lead_id", lead.id).order("uploaded_at"),
        supabase.from("lead_activities").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }),
      ]);
      setDocs(d.data ?? []);
      setActs(a.data ?? []);
      setInvoices(i.data ?? []);
    };
    load();
    const ch = supabase
      .channel(`lead-${lead.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `lead_id=eq.${lead.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_activities", filter: `lead_id=eq.${lead.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `lead_id=eq.${lead.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [lead]);

  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border bg-card/60 px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-xl">{lead.client_name}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{lead.property_type}</Badge>
                <Badge>{statusLabel(lead.status)}</Badge>
                <span className="text-sm font-medium text-[color:var(--accent)]">
                  {fmtMoney(lead.budget)}
                </span>
                {lead.locked && (
                  <Badge variant="secondary" className="bg-[color:var(--success)]/20 text-[color:var(--success)]">
                    <Lock className="mr-1 h-3 w-3" /> Verrouillé
                  </Badge>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="p-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Aperçu & activité</TabsTrigger>
            <TabsTrigger value="docs">Documents</TabsTrigger>
            <TabsTrigger value="finances">Finances & contrat</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab lead={lead} acts={acts} canEdit={isStaff && !lead.locked} />
          </TabsContent>
          <TabsContent value="docs" className="mt-4">
            <DocsTab lead={lead} docs={docs} isStaff={isStaff} />
          </TabsContent>
          <TabsContent value="finances" className="mt-4">
            <FinancesTab lead={lead} docs={docs} invoices={invoices} isStaff={isStaff} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function OverviewTab({ lead, acts, canEdit }: { lead: Lead; acts: Activity[]; canEdit: boolean }) {
  const [form, setForm] = useState({
    client_name: lead.client_name,
    email: lead.email,
    phone: lead.phone ?? "",
    budget: lead.budget?.toString() ?? "",
    property_type: lead.property_type,
    status: lead.status,
    notes: lead.notes ?? "",
  });
  const [note, setNote] = useState("");

  const save = async () => {
    const { error } = await supabase
      .from("leads")
      .update({
        client_name: form.client_name,
        email: form.email,
        phone: form.phone || null,
        budget: form.budget ? Number(form.budget) : null,
        property_type: form.property_type,
        status: form.status,
        notes: form.notes || null,
      })
      .eq("id", lead.id);
    if (error) return toast.error(error.message);
    toast.success("Lead mis à jour");
  };

  const addNote = async () => {
    if (!note.trim()) return;
    const { error } = await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      message: note,
      kind: "note",
    });
    if (error) return toast.error(error.message);
    setNote("");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Nom du client</Label>
          <Input
            value={form.client_name}
            onChange={(e) => setForm({ ...form, client_name: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!canEdit} />
        </div>
        <div className="space-y-1.5">
          <Label>Téléphone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit} />
        </div>
        <div className="space-y-1.5">
          <Label>Budget (€)</Label>
          <Input
            type="number"
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Type de bien</Label>
          <Select
            value={form.property_type}
            onValueChange={(v) => setForm({ ...form, property_type: v as Lead["property_type"] })}
            disabled={!canEdit}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Appartement">Appartement</SelectItem>
              <SelectItem value="Villa">Villa</SelectItem>
              <SelectItem value="Bureau">Bureau</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Statut</Label>
          <Select
            value={form.status}
            onValueChange={(v) => setForm({ ...form, status: v as Lead["status"] })}
            disabled={!canEdit}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes internes</Label>
        <Textarea
          rows={3}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          disabled={!canEdit}
        />
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <InviteClientButton lead={lead} />
          <Button onClick={save} className="bg-gradient-brand">Enregistrer</Button>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold">Journal d'activité</h4>
        {canEdit && (
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="Consigner une interaction… (appel, rendez-vous, e-mail)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
            />
            <Button onClick={addNote} size="sm"><MessageCircle className="mr-1 h-4 w-4" /> Ajouter</Button>
          </div>
        )}
        <ul className="mt-4 space-y-3">
          {acts.length === 0 && (
            <li className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Aucune activité pour le moment.
            </li>
          )}
          {acts.map((a) => (
            <li key={a.id} className="rounded-lg border border-border bg-card p-3">
              <div className="text-sm">{a.message}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {a.kind} · {new Date(a.created_at).toLocaleString("fr-FR")}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DocsTab({ lead, docs, isStaff }: { lead: Lead; docs: Doc[]; isStaff: boolean }) {
  const grouped = REQUIRED_DOCS.map((t) => ({
    type: t,
    items: docs.filter((d) => d.document_type === t),
  }));
  const otherDocs = docs.filter((d) => !REQUIRED_DOCS.includes(d.document_type as never));

  return (
    <div className="space-y-4">
      {grouped.map((g) => (
        <div key={g.type} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium">{docLabel(g.type)}</div>
            <Badge variant={g.items.some((i) => i.status === "Approved") ? "default" : "outline"}>
              {g.items.length} fichier(s)
            </Badge>
          </div>
          <ul className="mt-3 space-y-2">
            {g.items.length === 0 && (
              <li className="text-xs text-muted-foreground">En attente du dépôt par le client.</li>
            )}
            {g.items.map((d) => (
              <DocItem key={d.id} doc={d} isStaff={isStaff} locked={lead.locked} />
            ))}
          </ul>
        </div>
      ))}
      {otherDocs.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="font-medium">Autres documents</div>
          <ul className="mt-3 space-y-2">
            {otherDocs.map((d) => <DocItem key={d.id} doc={d} isStaff={isStaff} locked={lead.locked} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

function DocItem({ doc, isStaff, locked }: { doc: Doc; isStaff: boolean; locked: boolean }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("documents")
      .update({ status: "Approved", reviewed_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", doc.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await notifyClient(doc, `Votre ${docLabel(doc.document_type)} a été approuvé.`);
    toast.success("Approuvé");
  };
  const reject = async () => {
    if (!reason.trim()) return toast.error("Motif obligatoire");
    setBusy(true);
    const { error } = await supabase
      .from("documents")
      .update({ status: "Rejected", rejection_reason: reason, reviewed_at: new Date().toISOString() })
      .eq("id", doc.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await notifyClient(doc, `Votre ${docLabel(doc.document_type)} a été rejeté : ${reason}`);
    toast.success("Rejeté — client notifié");
    setRejecting(false);
    setReason("");
  };

  const view = async () => {
    const { data, error } = await supabase.storage.from("lead-documents").createSignedUrl(doc.file_path, 60);
    if (error) return toast.error(error.message);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <button onClick={view} className="truncate text-left hover:underline">
          {doc.file_name ?? doc.file_path.split("/").pop()}
        </button>
        <StatusPill status={doc.status} kind="doc" />
      </div>
      {doc.status === "Rejected" && doc.rejection_reason && (
        <div className="basis-full text-xs text-destructive">Motif : {doc.rejection_reason}</div>
      )}
      {isStaff && !locked && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={view}><ExternalLink className="h-3.5 w-3.5" /></Button>
          {doc.status !== "Approved" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={approve} className="text-[color:var(--success)] border-[color:var(--success)]/40 hover:bg-[color:var(--success)]/10">
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}
          {doc.status !== "Rejected" && (
            <Dialog open={rejecting} onOpenChange={setRejecting}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rejeter le document</DialogTitle>
                </DialogHeader>
                <Textarea placeholder="Pourquoi ce document est-il rejeté ?" value={reason} onChange={(e) => setReason(e.target.value)} />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRejecting(false)}>Annuler</Button>
                  <Button variant="destructive" onClick={reject} disabled={busy}>Rejeter & notifier</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
    </li>
  );
}

function StatusPill({ status, kind }: { status: string; kind?: "doc" | "invoice" }) {
  const map: Record<string, string> = {
    Pending: "bg-amber-100 text-amber-800",
    Approved: "bg-[color:var(--success)]/15 text-[color:var(--success)]",
    Rejected: "bg-destructive/15 text-destructive",
    Draft: "bg-muted text-muted-foreground",
    Sent: "bg-blue-100 text-blue-800",
    Paid: "bg-[color:var(--success)]/15 text-[color:var(--success)]",
    Overdue: "bg-destructive/15 text-destructive",
  };
  const label = kind === "invoice" ? invoiceStatusLabel(status) : docStatusLabel(status);
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", map[status] ?? "bg-muted")}>
      {label}
    </span>
  );
}

async function notifyClient(doc: Doc, message: string) {
  const { data: lead } = await supabase.from("leads").select("client_user_id").eq("id", doc.lead_id).maybeSingle();
  if (!lead?.client_user_id) return;
  await supabase.from("notifications").insert({
    user_id: lead.client_user_id,
    lead_id: doc.lead_id,
    title: `Document ${doc.status === "Approved" ? "approuvé" : "à corriger"}`,
    message,
  });
}

function FinancesTab({
  lead,
  docs,
  invoices,
  isStaff,
}: {
  lead: Lead;
  docs: Doc[];
  invoices: Invoice[];
  isStaff: boolean;
}) {
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [genOpen, setGenOpen] = useState<null | "Proforma" | "Standard">(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const statusIdx = STATUSES.indexOf(lead.status as never);
  const canProforma = isStaff && !lead.locked && statusIdx >= STATUSES.indexOf("Offer Made");
  const canFinal = isStaff && !lead.locked && statusIdx >= STATUSES.indexOf("Contract Pending");
  const reqApproved = REQUIRED_DOCS.every((t) =>
    docs.some((d) => d.document_type === t && d.status === "Approved"),
  );
  const canYousign = isStaff && !lead.locked && reqApproved && statusIdx >= STATUSES.indexOf("Offer Made");
  const hasFinalInvoice = invoices.some((i) => i.invoice_type === "Standard");

  const createInvoice = async () => {
    if (!genOpen) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Saisissez un montant valide");
    setBusy(true);
    const year = new Date().getFullYear();
    const prefix = genOpen === "Proforma" ? "PRO" : "INV";
    const seq = Math.floor(1000 + Math.random() * 9000);
    const invoice_number = `${prefix}-${year}-${seq}`;
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        lead_id: lead.id,
        invoice_type: genOpen,
        invoice_number,
        amount: amt,
        status: "Sent",
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      })
      .select("*")
      .single();
    if (error || !data) {
      setBusy(false);
      return toast.error(error?.message ?? "Échec");
    }
    try {
      await generateAndUploadInvoicePdf(data as Invoice, lead);
    } catch (e) {
      toast.warning("Facture enregistrée, mais l'envoi du PDF a échoué : " + (e as Error).message);
    }
    if (lead.client_user_id) {
      await supabase.from("notifications").insert({
        user_id: lead.client_user_id,
        lead_id: lead.id,
        title: `Nouvelle facture ${invoiceTypeLabel(genOpen)}`,
        message: `${invoice_number} — ${fmtMoney(amt)}`,
      });
    }
    setBusy(false);
    setGenOpen(null);
    setAmount("");
    setPreview(data as Invoice);
    toast.success(`Facture ${invoiceTypeLabel(genOpen)} générée`);
  };

  const sendToYousign = async () => {
    if (!canYousign) return;
    setBusy(true);
    const { error } = await supabase
      .from("leads")
      .update({ status: "Contract Pending" })
      .eq("id", lead.id);
    if (!error) {
      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        message: "Contrat envoyé à Yousign — en attente de signature.",
        kind: "system",
      });
      if (lead.client_user_id) {
        await supabase.from("notifications").insert({
          user_id: lead.client_user_id,
          lead_id: lead.id,
          title: "Contrat prêt à signer",
          message: "Merci de relire et signer les documents sur Yousign.",
        });
      }
      toast.success("Envoyé à Yousign — en attente de signature");
    } else toast.error(error.message);
    setBusy(false);
  };

  const simulate = async () => {
    setBusy(true);
    const finalInv = invoices.find((i) => i.invoice_type === "Standard");
    await supabase.from("leads").update({ status: "Signed & Closed", locked: true }).eq("id", lead.id);
    if (finalInv) await supabase.from("invoices").update({ status: "Paid" }).eq("id", finalInv.id);
    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      kind: "system",
      message: "Contrat signé par le client et paiement reçu. Dossier verrouillé.",
    });
    if (lead.client_user_id) {
      await supabase.from("notifications").insert({
        user_id: lead.client_user_id,
        lead_id: lead.id,
        title: "Tout est signé ! 🎉",
        message: "Votre transaction est finalisée. Bienvenue chez vous.",
      });
    }
    confetti({ particleCount: 200, spread: 90, origin: { y: 0.4 } });
    setBusy(false);
    toast.success("Signé & clôturé");
  };

  return (
    <div className="space-y-6">
      {isStaff && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-sm font-semibold">Actions</h4>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              disabled={!canProforma}
              onClick={() => setGenOpen("Proforma")}
            >
              <FileText className="mr-2 h-4 w-4" /> Générer une proforma
            </Button>
            <Button
              variant="outline"
              disabled={!canFinal}
              onClick={() => setGenOpen("Standard")}
            >
              <FileText className="mr-2 h-4 w-4" /> Générer la facture finale
            </Button>
            <Button
              className="bg-gradient-brand"
              disabled={!canYousign || busy}
              onClick={sendToYousign}
            >
              <Send className="mr-2 h-4 w-4" /> Envoyer à Yousign
            </Button>
            <Button
              variant="secondary"
              disabled={busy || lead.locked || !hasFinalInvoice}
              onClick={simulate}
            >
              <PartyPopper className="mr-2 h-4 w-4" /> Simuler signature & paiement
            </Button>
          </div>
          {!reqApproved && (
            <p className="mt-2 text-xs text-muted-foreground">
              Yousign nécessite que tous les documents requis ({REQUIRED_DOCS.map(docLabel).join(", ")}) soient approuvés.
            </p>
          )}
        </div>
      )}

      <div>
        <h4 className="mb-3 text-sm font-semibold">Factures</h4>
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Aucune facture pour le moment.
          </div>
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{inv.invoice_number}</span>
                    <Badge variant="outline">{invoiceTypeLabel(inv.invoice_type)}</Badge>
                    <StatusPill status={inv.status} kind="invoice" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Émise le {fmtDate(inv.issue_date)} · Échéance {fmtDate(inv.due_date)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-semibold text-[color:var(--accent)]">{fmtMoney(inv.amount)}</div>
                  <Button variant="ghost" size="sm" onClick={() => setPreview(inv)}>Voir</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadInvoicePdf(inv, lead)}
                  >
                    PDF
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!genOpen} onOpenChange={(o) => !o && setGenOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Générer une facture {genOpen ? invoiceTypeLabel(genOpen) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Montant (€)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={genOpen === "Proforma" ? "5000" : "25000"}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(null)}>Annuler</Button>
            <Button onClick={createInvoice} disabled={busy} className="bg-gradient-brand">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Aperçu de la facture</DialogTitle>
          </DialogHeader>
          <AnimatePresence>
            {preview && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <BrandedInvoice invoice={preview} lead={lead} />
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setPreview(null)}>Fermer</Button>
                  <Button onClick={() => downloadInvoicePdf(preview, lead)} className="bg-gradient-brand">
                    Télécharger le PDF
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteClientButton({ lead }: { lead: Lead }) {
  const invite = useServerFn(inviteClientForLead);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<boolean>(!!lead.client_user_id);

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--success)]/15 px-2.5 py-1.5 text-xs font-medium text-[color:var(--success)]">
        <Check className="h-3.5 w-3.5" /> Invitation envoyée
      </span>
    );
  }

  const onClick = async () => {
    setBusy(true);
    try {
      await invite({ data: { leadId: lead.id, redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth` : undefined } });
      toast.success(`Invitation envoyée à ${lead.email}`);
      setSent(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={busy || !lead.email}>
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
      {busy ? "Envoi…" : "Inviter le client"}
    </Button>
  );
}
