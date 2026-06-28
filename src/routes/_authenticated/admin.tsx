import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { listAllUsers, grantRole, revokeRole, createStaffUser, resendInvite } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Équipe & rôles · Atrium" }] }),
  component: AdminPage,
});

type Person = { id: string; name: string | null; email: string | null; created_at: string; roles: string[] };

function AdminPage() {
  const { role, loading } = useAuth();
  const list = useServerFn(listAllUsers);
  const grant = useServerFn(grantRole);
  const revoke = useServerFn(revokeRole);
  const resend = useServerFn(resendInvite);
  const [users, setUsers] = useState<Person[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    try {
      const data = (await list()) as Person[];
      setUsers(data ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  useEffect(() => {
    if (loading || role !== "admin") return;
    reload();
  }, [loading, role]);

  if (loading) return (
    <AppShell role={role}>
      <div className="grid h-64 place-items-center text-muted-foreground">Chargement…</div>
    </AppShell>
  );

  if (role !== "admin")
    return (
      <AppShell role={role}>
        <div className="p-8 text-center text-muted-foreground">Accès administrateur uniquement.</div>
      </AppShell>
    );

  const doGrant = async (userId: string, newRole: "admin" | "agent" | "client") => {
    setBusy(userId);
    try {
      await grant({ data: { userId, role: newRole } });
      toast.success(`Rôle ${newRole} attribué`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const doRevoke = async (userId: string, r: string) => {
    setBusy(userId);
    try {
      await revoke({ data: { userId, role: r as "admin" | "agent" | "client" } });
      toast.success(`Rôle ${r} retiré`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell role={role}>
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Équipe & rôles</h1>
            <p className="text-sm text-muted-foreground">
              Attribuez à chaque utilisateur le rôle qui correspond à sa fonction. Les agents ne
              voient que les leads qui leur sont assignés ; les administrateurs voient tout.
            </p>
          </div>
          <CreateUserDialog onCreated={reload} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tous les utilisateurs ({users.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-2">Utilisateur</th>
                    <th className="p-2">Rôles</th>
                    <th className="p-2">Inscrit le</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-border align-top">
                      <td className="p-2">
                        <div className="font-medium">{u.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 && <span className="text-xs text-muted-foreground">Aucun rôle</span>}
                          {u.roles.map((r) => (
                            <button
                              key={r}
                              className="inline-flex items-center gap-1"
                              onClick={() => doRevoke(u.id, r)}
                              disabled={busy === u.id}
                              title="Cliquer pour retirer"
                            >
                              <Badge variant="outline" className="cursor-pointer hover:bg-destructive/10">
                                {r} ×
                              </Badge>
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {u.email && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy === u.id}
                              onClick={async () => {
                                setBusy(u.id);
                                try {
                                  await resend({
                                    data: {
                                      email: u.email!,
                                      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth?mode=invite` : undefined,
                                    },
                                  });
                                  toast.success(`Invitation renvoyée à ${u.email}`);
                                } catch (e) {
                                  toast.error((e as Error).message);
                                } finally {
                                  setBusy(null);
                                }
                              }}
                            >
                              Renvoyer l'invitation
                            </Button>
                          )}
                          <Select onValueChange={(v) => doGrant(u.id, v as never)} value="">
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Attribuer…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrateur</SelectItem>
                              <SelectItem value="agent">Agent</SelectItem>
                              <SelectItem value="client">Client</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function CreateUserDialog({ onCreated }: { onCreated: () => Promise<void> }) {
  const create = useServerFn(createStaffUser);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; msg: string }>({ kind: "idle", msg: "" });
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "agent" as "agent" | "admin",
    sendInvite: true,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus({ kind: "idle", msg: "" });
    try {
      const res = (await create({
        data: {
          name: form.name,
          email: form.email,
          role: form.role,
          sendInvite: form.sendInvite,
          password: form.sendInvite ? undefined : form.password,
          redirectTo: form.sendInvite && typeof window !== "undefined" ? `${window.location.origin}/auth?mode=invite` : undefined,
        },
      })) as { invited: boolean };
      const okMsg = res.invited
        ? `Invitation envoyée à ${form.email}`
        : `Compte ${form.role} créé pour ${form.email}`;
      setStatus({ kind: "ok", msg: okMsg });
      toast.success(okMsg);
      await onCreated();
      setTimeout(() => {
        setForm({ name: "", email: "", password: "", role: "agent", sendInvite: true });
        setOpen(false);
        setStatus({ kind: "idle", msg: "" });
      }, 1200);
    } catch (err) {
      const m = (err as Error).message;
      setStatus({ kind: "err", msg: `Échec : ${m}` });
      toast.error(m);
    } finally {
      setBusy(false);
    }
  };

  const genPassword = () => {
    const s = Array.from(crypto.getRandomValues(new Uint8Array(9)))
      .map((b) => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 55])
      .join("");
    setForm((f) => ({ ...f, password: s }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" /> Nouveau compte
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un compte agent ou admin</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="cu-name">Nom complet</Label>
            <Input id="cu-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cu-email">Email</Label>
            <Input id="cu-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Rôle</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "agent" | "admin" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="admin">Administrateur</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.sendInvite}
              onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })}
            />
            <span>
              <span className="font-medium">Envoyer un e-mail d'invitation</span>
              <span className="block text-xs text-muted-foreground">
                L'utilisateur reçoit un lien pour définir son mot de passe lui-même.
              </span>
            </span>
          </label>
          {!form.sendInvite && (
            <div className="grid gap-2">
              <Label htmlFor="cu-password">Mot de passe temporaire</Label>
              <div className="flex gap-2">
                <Input id="cu-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <Button type="button" variant="outline" onClick={genPassword}>Générer</Button>
              </div>
              <p className="text-xs text-muted-foreground">L'utilisateur pourra se connecter immédiatement et le changer ensuite.</p>
            </div>
          )}
          {status.kind !== "idle" && (
            <div
              className={
                status.kind === "ok"
                  ? "rounded-md border border-[color:var(--success)]/40 bg-[color:var(--success)]/10 px-3 py-2 text-sm text-[color:var(--success)]"
                  : "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              }
            >
              {status.msg}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={busy}>
              {busy ? (form.sendInvite ? "Envoi…" : "Création…") : form.sendInvite ? "Envoyer l'invitation" : "Créer le compte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
