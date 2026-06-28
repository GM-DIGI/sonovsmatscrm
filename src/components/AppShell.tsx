import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, KanbanSquare, FileText, Users, Home, Bell, ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export function AppShell({ children, role }: { children: ReactNode; role: AppRole | null }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const initials = (user?.user_metadata?.name as string | undefined)?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "·";

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const staffNav = [
    { to: "/dashboard", label: "Pipeline", icon: KanbanSquare },
    { to: "/invoices", label: "Factures", icon: FileText },
  ];
  const adminExtra = [{ to: "/admin", label: "Équipe & rôles", icon: Users }];
  const clientNav = [{ to: "/portal", label: "Mon parcours", icon: Home }];

  const nav = role === "client" ? clientNav : role === "admin" ? [...staffNav, ...adminExtra] : staffNav;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-[color:var(--sidebar)] text-[color:var(--sidebar-foreground)] md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[color:var(--success)] text-[color:var(--success-foreground)] font-bold">
            A
          </div>
          <div>
            <div className="text-sm font-semibold leading-none">Atrium</div>
            <div className="text-[10px] uppercase tracking-wider opacity-60">CRM Immobilier</div>
          </div>
        </div>
        <div className="px-3 py-2">
          {role && (
            <Badge variant="outline" className="border-white/10 bg-white/5 text-[10px] uppercase tracking-wider text-[color:var(--sidebar-foreground)]">
              {roleLabel(role)}
            </Badge>
          )}
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                  active
                    ? "bg-[color:var(--sidebar-accent)] text-[color:var(--sidebar-accent-foreground)]"
                    : "text-[color:var(--sidebar-foreground)]/80 hover:bg-white/5 hover:text-[color:var(--sidebar-foreground)]",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/5">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-brand text-sm font-semibold text-white">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {user?.user_metadata?.name ?? user?.email}
                  </div>
                  <div className="truncate text-xs opacity-60">{user?.email}</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuLabel>Connecté en tant que</DropdownMenuLabel>
              <DropdownMenuItem disabled className="opacity-70">{user?.email}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card/60 px-4 backdrop-blur md:px-6">
          <div className="md:hidden flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded bg-gradient-brand text-xs font-bold text-white">A</div>
            <span className="font-semibold">Atrium</span>
          </div>
          <div className="flex items-center gap-2">
            {loading ? <Skeleton className="h-8 w-32" /> : <NotificationsBell />}
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function NotificationsBell() {
  const [items, setItems] = useState<{ id: string; title: string; message: string | null; read: boolean; created_at: string }[]>([]);
  const unread = items.filter((i) => !i.read).length;

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id,title,message,read,created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      setItems(data ?? []);
    };
    load();
    const ch = supabase
      .channel("notifications-shell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const markRead = async () => {
    if (unread === 0) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .in("id", items.filter((i) => !i.read).map((i) => i.id));
  };

  return (
    <DropdownMenu onOpenChange={(o) => o && markRead()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[color:var(--success)] px-1 text-[10px] font-semibold text-[color:var(--success-foreground)]">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">Notifications</div>
        <ScrollArea className="max-h-80">
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              <ShieldCheck className="mx-auto mb-2 h-6 w-6 opacity-50" />
              Tout est à jour.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id} className="px-4 py-3 text-sm">
                  <div className="font-medium">{n.title}</div>
                  {n.message && <div className="text-muted-foreground">{n.message}</div>}
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("fr-FR")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
