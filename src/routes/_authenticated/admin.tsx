import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { listAllUsers, grantRole, revokeRole } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team & Roles</h1>
          <p className="text-sm text-muted-foreground">
            Grant each user the role that matches their job. Agents can only see leads assigned to
            them; admins see everything.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All users ({users.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-2">User</th>
                    <th className="p-2">Roles</th>
                    <th className="p-2">Joined</th>
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
                          {u.roles.length === 0 && <span className="text-xs text-muted-foreground">No role</span>}
                          {u.roles.map((r) => (
                            <button
                              key={r}
                              className="inline-flex items-center gap-1"
                              onClick={() => doRevoke(u.id, r)}
                              disabled={busy === u.id}
                              title="Click to revoke"
                            >
                              <Badge variant="outline" className="cursor-pointer hover:bg-destructive/10">
                                {r} ×
                              </Badge>
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-2 text-right">
                        <Select onValueChange={(v) => doGrant(u.id, v as never)} value="">
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Grant…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="agent">Agent</SelectItem>
                            <SelectItem value="client">Client</SelectItem>
                          </SelectContent>
                        </Select>
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
