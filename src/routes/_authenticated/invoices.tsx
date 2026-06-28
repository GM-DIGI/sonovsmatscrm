import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandedInvoice } from "@/components/BrandedInvoice";
import { downloadInvoicePdf } from "@/lib/pdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({ meta: [{ title: "Invoices · Atrium CRM" }] }),
  component: InvoicesPage,
});

type Row = Tables<"invoices"> & {
  leads: Pick<Tables<"leads">, "client_name" | "email" | "property_type"> | null;
};

function InvoicesPage() {
  const { role, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState<Row | null>(null);

  useEffect(() => {
    if (loading) return;
    const load = async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*, leads(client_name,email,property_type)")
        .order("created_at", { ascending: false });
      setRows((data as Row[]) ?? []);
    };
    load();
    const ch = supabase
      .channel("invoices-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading]);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const paid = rows.filter((r) => r.status === "Paid").reduce((s, r) => s + Number(r.amount), 0);
  const outstanding = total - paid;

  return (
    <AppShell role={role}>
      <div className="space-y-5 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat title="Total invoiced" value={fmtMoney(total)} />
          <Stat title="Paid" value={fmtMoney(paid)} tint="success" />
          <Stat title="Outstanding" value={fmtMoney(outstanding)} tint="warn" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-2">Invoice</th>
                    <th className="p-2">Client</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Issued</th>
                    <th className="p-2">Due</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        No invoices yet — generate one from a lead.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2 font-mono">{r.invoice_number}</td>
                      <td className="p-2">{r.leads?.client_name ?? "—"}</td>
                      <td className="p-2"><Badge variant="outline">{r.invoice_type}</Badge></td>
                      <td className="p-2">{fmtDate(r.issue_date)}</td>
                      <td className="p-2">{fmtDate(r.due_date)}</td>
                      <td className="p-2">
                        <Badge
                          className={cn(
                            r.status === "Paid" && "bg-[color:var(--success)] text-[color:var(--success-foreground)]",
                          )}
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-right font-medium">{fmtMoney(r.amount)}</td>
                      <td className="p-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setPreview(r)}>View</Button>
                        {r.leads && (
                          <Button variant="ghost" size="sm" onClick={() => downloadInvoicePdf(r, r.leads!)}>
                            PDF
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice</DialogTitle>
          </DialogHeader>
          {preview?.leads && <BrandedInvoice invoice={preview} lead={preview.leads} />}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Stat({ title, value, tint }: { title: string; value: string; tint?: "success" | "warn" }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        tint === "success" && "border-[color:var(--success)]/30",
        tint === "warn" && "border-amber-300/40",
      )}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
