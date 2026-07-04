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
  mode: z.enum(["signin", "signup", "invite", "recovery"]).optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Connexion · SONOV Smart CRM" },
      { name: "description", content: "Accédez à votre espace SONOV Smart CRM ou à votre portail client." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [authReady, setAuthReady] = useState(false);
  const [linkMode, setLinkMode] = useState<"invite" | "recovery" | null>(
    mode === "invite" || mode === "recovery" ? mode : null,
  );
  const [linkError, setLinkError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const restoreAuthLink = async () => {
      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        const urlType = hashParams.get("type") ?? url.searchParams.get("type") ?? mode;
        const authLinkMode = urlType === "invite" || urlType === "recovery" ? urlType : null;
        const authError = hashParams.get("error_description") ?? url.searchParams.get("error_description");

        if (authError) {
          throw new Error(decodeURIComponent(authError.replace(/\+/g, " ")));
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        if (data.session?.user.email) setEmail(data.session.user.email);

        if (authLinkMode) {
          setIsSignup(false);
          setLinkMode(authLinkMode);
          window.history.replaceState({}, document.title, `/auth?mode=${authLinkMode}`);
          return;
        }

        if (data.session) navigate({ to: "/app" });
      } catch (err) {
        if (!mounted) return;
        const message = (err as Error).message || "Lien d'invitation invalide ou expiré.";
        setLinkError(message);
        toast.error(message);
      } finally {
        if (mounted) setAuthReady(true);
      }
    };

    restoreAuthLink();
    return () => {
      mounted = false;
    };
  }, [mode, navigate]);

  const submitPasswordSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Lien d'invitation invalide ou expiré. Renvoyez une nouvelle invitation.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Mot de passe défini — accès ouvert.");
      navigate({ to: "/app" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

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

  if (!authReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-muted-foreground">
        Vérification du lien…
      </div>
    );
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[color:var(--sidebar)] p-10 text-[color:var(--sidebar-foreground)] md:flex">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[color:var(--success)] text-[color:var(--success-foreground)] font-bold">
            S
          </div>
          <span className="text-lg font-semibold">SONOV</span>
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
        <p className="text-xs opacity-60">© 2026 SONOV Smart CRM</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border">
          <CardHeader>
            <CardTitle className="text-2xl">
              {linkMode
                ? linkMode === "invite"
                  ? "Accepter l'invitation"
                  : "Réinitialiser le mot de passe"
                : isSignup
                  ? "Créer votre compte"
                  : "Bon retour"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {linkMode
                ? "Définissez votre mot de passe pour activer l'accès à votre espace."
                : isSignup
                  ? "Inscrivez-vous pour accéder à votre portail client ou à votre espace agent."
                  : "Connectez-vous pour continuer."}
            </p>
          </CardHeader>
          <CardContent>
            {linkMode ? (
              <form onSubmit={submitPasswordSetup} className="space-y-4">
                {linkError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {linkError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="invite-email">E-mail</Label>
                  <Input id="invite-email" type="email" value={email} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-password">Nouveau mot de passe</Label>
                  <Input
                    id="invite-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-confirm-password">Confirmer le mot de passe</Label>
                  <Input
                    id="invite-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full bg-gradient-brand" disabled={loading || !!linkError}>
                  {loading ? "Activation…" : "Activer mon compte"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setLinkMode(null);
                    setLinkError("");
                  }}
                  className="block w-full text-center text-sm text-muted-foreground hover:text-foreground"
                >
                  Se connecter avec un compte existant
                </button>
              </form>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
