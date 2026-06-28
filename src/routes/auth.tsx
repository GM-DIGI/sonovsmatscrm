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
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in · Atrium CRM" },
      { name: "description", content: "Access your Atrium CRM workspace or client portal." },
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
        toast.success("Account created — signing you in…");
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
            One platform.<br />Every signature.
          </h2>
          <p className="mt-3 max-w-md text-sm opacity-80">
            Agents close deals from a polished kanban. Clients track their journey in a secure
            portal. Invoices and signatures, automated.
          </p>
        </div>
        <p className="text-xs opacity-60">© 2026 Atrium Real Estate Group</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border">
          <CardHeader>
            <CardTitle className="text-2xl">
              {isSignup ? "Create your account" : "Welcome back"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {isSignup
                ? "Sign up to access your client portal or your agent workspace."
                : "Sign in to continue."}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {isSignup && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
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
                <Label htmlFor="password">Password</Label>
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
                {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => setIsSignup((s) => !s)}
                className="block w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {isSignup ? "Already have an account? Sign in" : "New here? Create an account"}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
