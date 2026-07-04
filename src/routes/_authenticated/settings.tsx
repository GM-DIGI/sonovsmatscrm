import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { roleLabel } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Paramètres · SONOV Smart CRM" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };
  return (
    <AppShell role={role}>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
          <p className="text-sm text-muted-foreground">Votre profil et préférences de compte.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Nom</Label>
              <Input readOnly value={(user?.user_metadata?.name as string) ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input readOnly value={user?.email ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label>Rôle</Label>
              <div>{role && <Badge variant="outline">{roleLabel(role)}</Badge>}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
