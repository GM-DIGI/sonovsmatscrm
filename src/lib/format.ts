export const fmtMoney = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? Number(n) : n;
  if (v == null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
};

export const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

export const STATUSES = [
  "New",
  "Qualified",
  "Viewing Scheduled",
  "Offer Made",
  "Contract Pending",
  "Signed & Closed",
] as const;
export type LeadStatus = (typeof STATUSES)[number];

export const statusIndex = (s: string) => Math.max(0, STATUSES.indexOf(s as LeadStatus));

export const REQUIRED_DOCS = ["ID", "Proof of Address", "Payslip"] as const;
