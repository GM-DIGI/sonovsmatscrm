import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { KanbanBoard, type Lead } from "@/components/KanbanBoard";
import { LeadDrawer } from "@/components/LeadDrawer";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { REQUIRED_DOCS, type LeadStatus } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Pipeline · Atrium CRM" }] }),
  component: DashboardPage,
});

import { statusLabel } from "@/lib/format";

function DashboardPage() {
  const { user, role, loading } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [docs, setDocs] = useState<Tables<"documents">[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [q, setQ] = useState("");

  const reload = useCallback(async () => {
    const [{ data: l }, { data: d }] = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("documents").select("*"),
    ]);
    setLeads(l ?? []);
    setDocs(d ?? []);
  }, []);

  useEffect(() => {
    if (loading) return;
    reload();
    const ch = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading, reload]);

  // Keep selected lead fresh
  useEffect(() => {
    if (!selected) return;
    const next = leads.find((l) => l.id === selected.id);
    if (next && next !== selected) setSelected(next);
  }, [leads, selected]);

  const docCounts: Record<string, { approved: number; total: number; required: number }> = {};
  for (const l of leads) {
    const docsOfLead = docs.filter((d) => d.lead_id === l.id);
    const approvedRequired = REQUIRED_DOCS.filter((t) =>
      docsOfLead.some((d) => d.document_type === t && d.status === "Approved"),
    ).length;
    docCounts[l.id] = {
      approved: approvedRequired,
      total: docsOfLead.length,
      required: REQUIRED_DOCS.length,
    };
  }

  const visible = q
    ? leads.filter(
        (l) =>
          l.client_name.toLowerCase().includes(q.toLowerCase()) ||
          l.email.toLowerCase().includes(q.toLowerCase()),
      )
    : leads;

  const updateStatus = async (lead: Lead, status: LeadStatus) => {
    const { error } = await supabase.from("leads").update({ status }).eq("id", lead.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      kind: "status",
      message: `Statut modifié en « ${statusLabel(status)} ».`,
    });
  };

  const isStaff = role === "admin" || role === "agent";

  return (
    <AppShell role={role}>
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              {role === "admin"
                ? "Tous les leads, tous agents confondus."
                : "Vos leads actifs, regroupés par étape."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher un lead…"
                className="w-64 pl-8"
              />
            </div>
            {isStaff && user && <NewLeadDialog onCreated={reload} agentId={user.id} />}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {(["New", "Qualified", "Viewing Scheduled", "Offer Made", "Contract Pending", "Signed & Closed"] as LeadStatus[]).map(
            (s) => {
              const n = visible.filter((l) => l.status === s).length;
              return (
                <div
                  key={s}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="text-xs text-muted-foreground">{statusLabel(s)}</div>
                  <div className="mt-1 text-2xl font-semibold">{n}</div>
                </div>
              );
            },
          )}
        </div>

        <KanbanBoard
          leads={visible}
          docCounts={docCounts}
          onOpen={(l) => setSelected(l)}
          onStatusChange={updateStatus}
        />

        <LeadDrawer
          lead={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          isStaff={isStaff}
        />
      </div>
    </AppShell>
  );
}

function NewLeadDialog({ onCreated, agentId }: { onCreated: () => void; agentId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    client_name: "",
    email: "",
    phone: "",
    budget: "",
    property_type: "Appartement" as Lead["property_type"],
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.client_name || !form.email) return toast.error("Name and email required");
    setBusy(true);
    const { error } = await supabase.from("leads").insert({
      client_name: form.client_name,
      email: form.email,
      phone: form.phone || null,
      budget: form.budget ? Number(form.budget) : null,
      property_type: form.property_type,
      assigned_agent_id: agentId,
      status: "New",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Lead added — invite the client by asking them to sign up with this email.");
    setOpen(false);
    setForm({ client_name: "", email: "", phone: "", budget: "", property_type: "Appartement" });
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-brand"><Plus className="mr-1 h-4 w-4" /> New lead</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new lead</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Client name</Label>
            <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Budget (€)</Label>
            <Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Property type</Label>
            <Select value={form.property_type} onValueChange={(v) => setForm({ ...form, property_type: v as Lead["property_type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Appartement">Appartement</SelectItem>
                <SelectItem value="Villa">Villa</SelectItem>
                <SelectItem value="Bureau">Bureau</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-gradient-brand">Create lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
