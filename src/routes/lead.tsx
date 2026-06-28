import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Building2, Loader2 } from "lucide-react";

const searchSchema = z.object({
  campaign: z.string().optional(),
  source: z.string().optional(),
  utm_source: z.string().optional(),
  utm_campaign: z.string().optional(),
});

export const Route = createFileRoute("/lead")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Trouvez votre bien · Atrium Immobilier" },
      {
        name: "description",
        content:
          "Laissez vos coordonnées et un conseiller Atrium vous contacte sous 24 h pour vous présenter les biens correspondant à votre projet.",
      },
    ],
  }),
  component: LeadForm,
});

const PROPERTY_TYPES = [
  "Appartement",
  "Studio",
  "Villa",
  "Maison",
  "Bureau",
  "Local commercial",
  "Terrain",
] as const;

function LeadForm() {
  const search = useSearch({ from: "/lead" });
  const [form, setForm] = useState({
    client_name: "",
    email: "",
    phone: "",
    budget: "",
    property_type: "Appartement" as (typeof PROPERTY_TYPES)[number],
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.client_name.trim() || !form.email.trim()) {
      setError("Nom et e-mail sont obligatoires.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          campaign: search.campaign || search.utm_campaign || null,
          source: search.source || search.utm_source || "Formulaire campagne",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur lors de l'envoi.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 px-4 py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Demande reçue, merci&nbsp;!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Un conseiller Atrium vous contacte sous 24 heures pour vous présenter
            les biens correspondant à votre projet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 px-4 py-12 md:py-20">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
        <div className="text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs uppercase tracking-wider">
            <Building2 className="h-3.5 w-3.5" />
            Atrium Immobilier
          </div>
          <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
            Trouvez le bien fait pour vous.
          </h1>
          <p className="mt-4 text-white/70">
            Confiez-nous votre projet : nos conseillers vous proposent une sélection
            personnalisée de biens correspondant à votre budget et à vos critères,
            sous 24 heures.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-white/80">
            {[
              "Sélection sur mesure par un conseiller dédié",
              "Visites organisées à votre disposition",
              "Accompagnement complet jusqu'à la signature",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {t}
              </li>
            ))}
          </ul>
          {search.campaign && (
            <div className="mt-6 inline-block rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70">
              Campagne&nbsp;: <span className="font-medium text-white">{search.campaign}</span>
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-2xl md:p-8"
        >
          <div>
            <h2 className="text-xl font-semibold">Parlez-nous de votre projet</h2>
            <p className="text-sm text-muted-foreground">
              Réponse d'un conseiller sous 24 h.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Nom complet *</Label>
            <Input
              required
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              placeholder="Jean Dupont"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>E-mail *</Label>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="vous@exemple.fr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="06 12 34 56 78"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type de bien</Label>
              <Select
                value={form.property_type}
                onValueChange={(v) =>
                  setForm({ ...form, property_type: v as (typeof PROPERTY_TYPES)[number] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Budget (€)</Label>
              <Input
                type="number"
                min="0"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                placeholder="250000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Votre projet (facultatif)</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Quartier souhaité, surface, délai…"
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-gradient-brand text-base"
            size="lg"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…
              </>
            ) : (
              "Être rappelé sous 24 h"
            )}
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            En soumettant ce formulaire vous acceptez d'être contacté par Atrium au sujet de votre projet immobilier.
          </p>
        </form>
      </div>
    </div>
  );
}
