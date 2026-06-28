export const fmtMoney = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? Number(n) : n;
  if (v == null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
};

export const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
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

// ── French display labels ──────────────────────────────────────────────
export const STATUS_LABEL: Record<LeadStatus, string> = {
  "New": "Nouveau",
  "Qualified": "Qualifié",
  "Viewing Scheduled": "Visite planifiée",
  "Offer Made": "Offre émise",
  "Contract Pending": "Contrat en attente",
  "Signed & Closed": "Signé & clôturé",
};

export const DOC_LABEL: Record<string, string> = {
  "ID": "Pièce d'identité",
  "Proof of Address": "Justificatif de domicile",
  "Payslip": "Bulletin de salaire",
  "Proof of Income": "Justificatif de revenus",
  "Tax Statement": "Avis d'imposition",
};

export const DOC_STATUS_LABEL: Record<string, string> = {
  "Pending": "En attente",
  "Approved": "Approuvé",
  "Rejected": "Rejeté",
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  "Draft": "Brouillon",
  "Sent": "Envoyée",
  "Paid": "Payée",
  "Overdue": "En retard",
};

export const INVOICE_TYPE_LABEL: Record<string, string> = {
  "Proforma": "Proforma",
  "Standard": "Finale",
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrateur",
  agent: "Agent",
  client: "Client",
};

export const statusLabel = (s: string) => STATUS_LABEL[s as LeadStatus] ?? s;
export const docLabel = (s: string) => DOC_LABEL[s] ?? s;
export const docStatusLabel = (s: string) => DOC_STATUS_LABEL[s] ?? s;
export const invoiceStatusLabel = (s: string) => INVOICE_STATUS_LABEL[s] ?? s;
export const invoiceTypeLabel = (s: string) => INVOICE_TYPE_LABEL[s] ?? s;
export const roleLabel = (s: string) => ROLE_LABEL[s] ?? s;
