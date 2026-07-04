import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { STATUSES, statusLabel, fmtMoney, type LeadStatus } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Euro,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Tableau de bord · SONOV Smart CRM" },
      { name: "description", content: "KPIs, évolution, répartition et activité récente de votre pipeline." },
    ],
  }),
  component: AnalyticsPage,
});

type Lead = Tables<"leads">;
type Activity = Tables<"lead_activities">;
type Reminder = Tables<"scheduled_reminders">;

const CHART_COLORS = [
  "hsl(217 91% 60%)",
  "hsl(142 76% 45%)",
  "hsl(38 92% 55%)",
  "hsl(280 70% 60%)",
  "hsl(0 84% 60%)",
  "hsl(190 85% 45%)",
];

function AnalyticsPage() {
  const { role, loading: authLoading } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<(Activity & { lead?: { client_name: string } | null })[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      const [{ data: l }, { data: a }, { data: r }] = await Promise.all([
        supabase.from("leads").select("*").order("created_at", { ascending: false }),
        supabase
          .from("lead_activities")
          .select("*, lead:leads(client_name)")
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("scheduled_reminders")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      setLeads((l ?? []) as Lead[]);
      setActivities((a ?? []) as never);
      setReminders((r ?? []) as Reminder[]);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel("analytics")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_activities" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_reminders" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [authLoading]);

  const kpis = useMemo(() => {
    const total = leads.length;
    const signed = leads.filter((l) => l.status === "Signed & Closed").length;
    const active = total - signed;
    const revenue = leads
      .filter((l) => l.status === "Signed & Closed")
      .reduce((sum, l) => sum + (Number(l.budget) || 0), 0);
    const conversion = total > 0 ? (signed / total) * 100 : 0;
    const now = Date.now();
    const last30 = leads.filter(
      (l) => now - new Date(l.created_at).getTime() < 30 * 24 * 3600 * 1000,
    ).length;
    return { total, signed, active, revenue, conversion, last30 };
  }, [leads]);

  // Évolution : 12 dernières semaines
  const evolution = useMemo(() => {
    const weeks: { key: string; label: string; leads: number; signed: number; revenue: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - i * 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const label = start.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
      weeks.push({ key: start.toISOString(), label, leads: 0, signed: 0, revenue: 0 });
    }
    for (const l of leads) {
      const t = new Date(l.created_at).getTime();
      const idx = weeks.findIndex((w, i) => {
        const s = new Date(w.key).getTime();
        const next = i + 1 < weeks.length ? new Date(weeks[i + 1].key).getTime() : Infinity;
        return t >= s && t < next;
      });
      if (idx >= 0) {
        weeks[idx].leads += 1;
        if (l.status === "Signed & Closed") {
          weeks[idx].signed += 1;
          weeks[idx].revenue += Number(l.budget) || 0;
        }
      }
    }
    return weeks;
  }, [leads]);

  // Répartition par étape
  const byStage = useMemo(() => {
    return STATUSES.map((s) => ({
      name: statusLabel(s),
      value: leads.filter((l) => l.status === s).length,
    }));
  }, [leads]);

  // Répartition par source
  const bySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const key = l.source || "Direct";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [leads]);

  if (authLoading || loading) {
    return (
      <AppShell role={role}>
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role={role}>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">
            Vue analytique de votre pipeline, évolution, sources et activité récente.
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            icon={<Users className="h-4 w-4" />}
            label="Leads totaux"
            value={String(kpis.total)}
            hint={`${kpis.last30} sur 30 j`}
          />
          <Kpi
            icon={<Activity className="h-4 w-4" />}
            label="Leads actifs"
            value={String(kpis.active)}
            hint="En cours de traitement"
          />
          <Kpi
            icon={<BadgeCheck className="h-4 w-4" />}
            label="Taux de closing"
            value={`${kpis.conversion.toFixed(1)} %`}
            hint={`${kpis.signed} signés`}
          />
          <Kpi
            icon={<Euro className="h-4 w-4" />}
            label="CA signé"
            value={fmtMoney(kpis.revenue)}
            hint="Budgets cumulés"
          />
        </div>

        {/* Évolution */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="h-4 w-4 text-primary" />
                Évolution — 12 dernières semaines
              </div>
              <p className="text-xs text-muted-foreground">
                Nouveaux leads et closings par semaine.
              </p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <LineChart data={evolution} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="leads"
                  name="Nouveaux leads"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="signed"
                  name="Signés"
                  stroke={CHART_COLORS[1]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Répartition */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 text-sm font-medium">Répartition par étape du pipeline</div>
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <BarChart data={byStage} margin={{ top: 5, right: 12, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {byStage.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 text-sm font-medium">Répartition par source</div>
            {bySource.length === 0 ? (
              <div className="grid h-72 place-items-center text-sm text-muted-foreground">
                Aucune donnée de source pour l'instant.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={bySource}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={45}
                      paddingAngle={2}
                      label={({ name, value }) => `${name} (${value})`}
                      labelLine={false}
                      fontSize={11}
                    >
                      {bySource.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Activité récente */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="text-sm font-medium">Activité récente</div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </div>
            {activities.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Aucune activité récente.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {activities.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {a.lead?.client_name ?? "Lead"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {a.message}
                        </div>
                      </div>
                      <div className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {new Date(a.created_at).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-3 text-sm font-medium">
              Relances récentes
            </div>
            {reminders.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Aucune relance planifiée pour l'instant.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {reminders.slice(0, 10).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span
                      className={
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold uppercase " +
                        (r.status === "sent"
                          ? "bg-emerald-500/15 text-emerald-600"
                          : r.status === "failed"
                            ? "bg-red-500/15 text-red-600"
                            : r.status === "cancelled"
                              ? "bg-muted text-muted-foreground"
                              : "bg-amber-500/15 text-amber-600")
                      }
                    >
                      {r.channel === "whatsapp" ? "WA" : r.channel === "email" ? "@" : "•"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">
                        {r.status === "sent"
                          ? "Envoyée"
                          : r.status === "failed"
                            ? "Échec"
                            : r.status === "cancelled"
                              ? "Annulée"
                              : "Planifiée"}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {new Date(r.scheduled_for).toLocaleString("fr-FR")}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs">{label}</span>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
