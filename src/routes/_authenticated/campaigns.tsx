import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink, Megaphone, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({ meta: [{ title: "Formulaire campagne · SONOV Smart CRM" }] }),
  component: CampaignsPage,
});

type Row = { id: string; client_name: string; email: string; campaign: string | null; source: string | null; created_at: string };

function CampaignsPage() {
  const { role } = useAuth();
  const [origin, setOrigin] = useState("");
  const [campaign, setCampaign] = useState("");
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("leads")
        .select("id,client_name,email,campaign,source,created_at")
        .not("source", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);
      setRows((data ?? []) as Row[]);
    };
    load();
    const ch = supabase
      .channel("campaigns-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const url = origin
    ? `${origin}/lead${campaign ? `?campaign=${encodeURIComponent(campaign)}` : ""}`
    : "";

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Lien copié");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AppShell role={role}>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Formulaire de campagne</h1>
          <p className="text-sm text-muted-foreground">
            Partagez ce lien dans vos publicités (Facebook, Google Ads, LinkedIn…). Chaque
            soumission crée un lead synchronisé en temps réel dans le pipeline.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <Megaphone className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <Label>Nom de la campagne (facultatif)</Label>
                  <Input
                    placeholder="Ex : Facebook · Appartements Lyon"
                    value={campaign}
                    onChange={(e) => setCampaign(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Lien à partager</Label>
                <div className="flex gap-2">
                  <Input readOnly value={url} className="font-mono text-xs" />
                  <Button onClick={copy} variant="outline">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button asChild variant="outline">
                    <a href={url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Astuce&nbsp;: ajoutez <code>?utm_source=facebook&amp;utm_campaign=...</code>
                  pour tracer chaque source. Les leads sont assignés automatiquement à
                  l'agent ayant le moins de dossiers ouverts.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">
            Derniers leads issus de campagnes
          </div>
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucun lead encore — partagez le lien pour commencer.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.client_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                  </div>
                  <div className="text-xs">
                    <div className="font-medium">{r.campaign || "—"}</div>
                    <div className="text-muted-foreground">{r.source}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("fr-FR")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
