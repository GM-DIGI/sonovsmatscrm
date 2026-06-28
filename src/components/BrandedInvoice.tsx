import { fmtMoney, fmtDate } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";

export function BrandedInvoice({
  invoice,
  lead,
}: {
  invoice: Tables<"invoices">;
  lead: Pick<Tables<"leads">, "client_name" | "email" | "property_type">;
}) {
  const isPaid = invoice.status === "Paid";
  return (
    <div className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-white p-8 text-slate-900 shadow-elevated">
      <div className="flex items-start justify-between border-b-2 border-[color:var(--primary)] pb-4">
        <div>
          <div className="text-2xl font-bold tracking-[0.2em] text-[color:var(--primary)]">ATRIUM</div>
          <div className="text-xs text-[color:var(--accent)]">Real Estate Group</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold uppercase tracking-widest text-[color:var(--primary)]">
            {invoice.invoice_type} Invoice
          </div>
          <div className="text-sm text-[color:var(--accent)]">#{invoice.invoice_number}</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--accent)]">
            Billed to
          </div>
          <div className="mt-1 font-semibold">{lead.client_name}</div>
          <div className="text-slate-600">{lead.email}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--accent)]">
            Issue date
          </div>
          <div className="mt-1">{fmtDate(invoice.issue_date)}</div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--accent)]">
            Due date
          </div>
          <div className="mt-1">{fmtDate(invoice.due_date)}</div>
        </div>
      </div>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="bg-[color:var(--primary)] text-white">
            <th className="px-3 py-2 text-left">Description</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="px-3 py-3">
              <div className="font-medium">
                {invoice.invoice_type === "Proforma"
                  ? "Reservation fee / deposit"
                  : "Real estate transaction fee"}
              </div>
              <div className="text-xs text-slate-500">
                {lead.property_type} — {lead.client_name}
              </div>
            </td>
            <td className="px-3 py-3 text-right">1</td>
            <td className="px-3 py-3 text-right">{fmtMoney(invoice.amount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{fmtMoney(invoice.amount)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>VAT (0%)</span>
            <span>{fmtMoney(0)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-indigo-50 px-3 py-2 font-semibold text-[color:var(--primary)]">
            <span>Total due</span>
            <span>{fmtMoney(invoice.amount)}</span>
          </div>
        </div>
      </div>

      {isPaid && (
        <div className="mt-6 rounded-lg bg-[color:var(--success)] py-3 text-center text-lg font-bold tracking-widest text-[color:var(--success-foreground)]">
          PAID ✓
        </div>
      )}

      <div className="mt-8 border-t border-slate-200 pt-3 text-[10px] text-slate-400">
        Atrium Real Estate Group · contact@atrium.example · VAT EU-0000-0000
      </div>
    </div>
  );
}
