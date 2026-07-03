import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Loader2, Mail, MessageCircle, Clock, CheckCircle2, XCircle, Ban, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Reminder = {
  id: string;
  lead_id: string;
  channel: "whatsapp" | "email";
  body: string;
  send_at: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  sent_at: string | null;
  error: string | null;
  created_at: string;
  lead?: { client_name: string | null } | null;
};

export const Route = createFileRoute("/_authenticated/reminders")({
  head: () => ({ meta: [{ title: "Historique des relances · Atrium" }] }),
  component: RemindersPage,
});

type Filter = "all" | "pending" | "sent" | "failed" | "cancelled";

function RemindersPage() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("scheduled_reminders")
      .select("id,lead_id,channel,body,send_at,status,sent_at,error,created_at,lead:leads(client_name)")
      .order("send_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setItems((data as unknown as Reminder[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel("reminders-history")
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_reminders" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  const cancel = async (id: string) => {
    const { error } = await supabase
      .from("scheduled_reminders")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Relance annulée");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("scheduled_reminders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Relance supprimée");
  };

  const filtered = items.filter((r) => filter === "all" || r.status === filter);

  const counts = {
    all: items.length,
    pending: items.filter((r) => r.status === "pending").length,
    sent: items.filter((r) => r.status === "sent").length,
    failed: items.filter((r) => r.status === "failed").length,
    cancelled: items.filter((r) => r.status === "cancelled").length,
  };

  return (
    <AppShell role={role}>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Historique des relances</h1>
            <p className="text-sm text-muted-foreground">
              Consultez les relances planifiées, envoyées ou en erreur.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualiser
          </Button>
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">Toutes ({counts.all})</TabsTrigger>
            <TabsTrigger value="pending">Planifiées ({counts.pending})</TabsTrigger>
            <TabsTrigger value="sent">Envoyées ({counts.sent})</TabsTrigger>
            <TabsTrigger value="failed">Échecs ({counts.failed})</TabsTrigger>
            <TabsTrigger value="cancelled">Annulées ({counts.cancelled})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="rounded-xl border border-border bg-card">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Aucune relance à afficher.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Statut</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Date/heure</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="font-medium">
                      {r.lead?.client_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ChannelBadge channel={r.channel} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      <div>{new Date(r.send_at).toLocaleString("fr-FR")}</div>
                      {r.sent_at && (
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          envoyée {new Date(r.sent_at).toLocaleString("fr-FR")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="line-clamp-2 text-sm text-muted-foreground" title={r.body}>
                        {r.body}
                      </div>
                      {r.error && (
                        <div className="mt-1 text-xs text-destructive" title={r.error}>
                          Erreur : {r.error}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {r.status === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => cancel(r.id)} title="Annuler">
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => remove(r.id)} title="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: Reminder["status"] }) {
  const map = {
    pending: { label: "Planifiée", icon: Clock, cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    sent: { label: "Envoyée", icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    failed: { label: "Échec", icon: XCircle, cls: "bg-destructive/15 text-destructive border-destructive/30" },
    cancelled: { label: "Annulée", icon: Ban, cls: "bg-muted text-muted-foreground border-border" },
  }[status];
  const Icon = map.icon;
  return (
    <Badge variant="outline" className={map.cls}>
      <Icon className="mr-1 h-3 w-3" />
      {map.label}
    </Badge>
  );
}

function ChannelBadge({ channel }: { channel: Reminder["channel"] }) {
  if (channel === "whatsapp") {
    return (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
        <MessageCircle className="mr-1 h-3 w-3" /> WhatsApp
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-600">
      <Mail className="mr-1 h-3 w-3" /> Email
    </Badge>
  );
}
