import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Connexion · Atrium CRM" },
      { name: "description", content: "Accédez à votre espace Atrium CRM ou à votre portail client." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name }, emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        toast.success("Compte créé — connexion en cours…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/app" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[color:var(--sidebar)] p-10 text-[color:var(--sidebar-foreground)] md:flex">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[color:var(--success)] text-[color:var(--success-foreground)] font-bold">
            A
          </div>
          <span className="text-lg font-semibold">Atrium</span>
        </div>
        <div>
          <h2 className="text-4xl font-semibold leading-tight">
            Une plateforme.<br />Chaque signature.
          </h2>
          <p className="mt-3 max-w-md text-sm opacity-80">
            Les agents closent leurs deals depuis un kanban élégant. Les clients suivent leur
            parcours dans un portail sécurisé. Factures et signatures, automatisées.
          </p>
        </div>
        <p className="text-xs opacity-60">© 2026 Atrium Real Estate Group</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border">
          <CardHeader>
            <CardTitle className="text-2xl">
              {isSignup ? "Créer votre compte" : "Bon retour"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {isSignup
                ? "Inscrivez-vous pour accéder à votre portail client ou à votre espace agent."
                : "Connectez-vous pour continuer."}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {isSignup && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nom complet</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
              </div>
              <Button type="submit" className="w-full bg-gradient-brand" disabled={loading}>
                {loading ? "Veuillez patienter…" : isSignup ? "Créer le compte" : "Se connecter"}
              </Button>
              <button
                type="button"
                onClick={() => setIsSignup((s) => !s)}
                className="block w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {isSignup ? "Déjà un compte ? Se connecter" : "Nouveau ici ? Créer un compte"}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
