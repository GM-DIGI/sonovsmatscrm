import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, KanbanSquare, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SONOV — CRM immobilier, portail client & facturation" },
      {
        name: "description",
        content:
          "SONOV pilote tout le parcours client : pipeline kanban, contrôle des documents, facturation de marque et signature électronique — avec un portail client soigné.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-brand text-primary-foreground font-bold">
            A
          </div>
          <span className="font-semibold tracking-tight">SONOV</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/auth">
            <Button variant="ghost" size="sm">Se connecter</Button>
          </Link>
          <Link to="/auth" search={{ mode: "signup" } as never}>
            <Button size="sm">Commencer</Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6">
        <section className="grid gap-12 py-16 md:grid-cols-2 md:py-24">
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-[color:var(--success)]" />
              Multi-agents · Portail client · Facturation de marque
            </span>
            <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
              L'OS du parcours client pour{" "}
              <span className="text-gradient-brand">les équipes immobilières modernes.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
              Faites avancer vos leads de <em>Nouveau</em> à <em>Signé</em> sur un kanban élégant.
              Contrôlez les documents clients, générez des factures proforma et finales, et lancez
              la signature électronique — depuis un seul espace de travail.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" search={{ mode: "signup" } as never}>
                <Button size="lg" className="bg-gradient-brand">
                  Démarrer gratuitement <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="outline">Se connecter</Button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 -z-10 bg-gradient-brand opacity-20 blur-3xl rounded-full" />
            <div className="rounded-2xl border border-border bg-card p-3 shadow-elevated">
              <div className="rounded-xl bg-[color:var(--sidebar)] p-5 text-[color:var(--sidebar-foreground)]">
                <div className="flex items-center justify-between text-xs opacity-70">
                  <span>Pipeline</span>
                  <span>T3 ‘26</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  {["Nouveau", "Qualifié", "Offre"].map((s, i) => (
                    <div key={s} className="rounded-lg bg-white/5 p-3">
                      <div className="opacity-70">{s}</div>
                      <div className="mt-1 text-lg font-semibold">{[12, 7, 4][i]}</div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[color:var(--success)]"
                          style={{ width: `${[80, 60, 40][i]}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    { name: "Marie Dubois", v: "540 k€", t: "Villa" },
                    { name: "Lucas Bernard", v: "280 k€", t: "Appartement" },
                  ].map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center justify-between rounded-lg bg-white/5 p-3"
                    >
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs opacity-70">{c.t}</div>
                      </div>
                      <div className="text-sm font-semibold text-[color:var(--success)]">{c.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 pb-24 md:grid-cols-3">
          {[
            {
              icon: KanbanSquare,
              title: "Kanban multi-agents",
              desc: "Sécurité stricte : chaque agent ne voit que ses propres leads, les admins voient tout.",
            },
            {
              icon: ShieldCheck,
              title: "Portail client sécurisé",
              desc: "Les clients déposent leurs documents et suivent leur statut d'approbation en direct.",
            },
            {
              icon: FileText,
              title: "Facturation de marque",
              desc: "Factures proforma et finales générées au format PDF soigné.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-brand text-primary-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © 2026 SONOV Smart CRM · Espace de démonstration
      </footer>
    </div>
  );
}
