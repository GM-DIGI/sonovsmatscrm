// Client-side PDF generation using pdfmake (browser build).
import { supabase } from "@/integrations/supabase/client";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_type: string;
  amount: number;
  issue_date: string;
  due_date: string;
  status: string;
  notes?: string | null;
  lead_id: string;
};
type LeadLite = { client_name: string; email: string; property_type: string };

async function getPdfMake() {
  const pm = (await import("pdfmake/build/pdfmake")) as any;
  const fonts = (await import("pdfmake/build/vfs_fonts")) as any;
  const pdfMake = pm.default ?? pm;
  pdfMake.vfs = fonts.default?.pdfMake?.vfs ?? fonts.pdfMake?.vfs ?? fonts.vfs;
  return pdfMake;
}

export function buildInvoiceDoc(invoice: InvoiceRow, lead: LeadLite) {
  const slate = "#2c3a6b";
  const indigo = "#4338ca";
  const mint = "#10b981";
  return {
    pageMargins: [40, 60, 40, 60] as [number, number, number, number],
    content: [
      {
        columns: [
          {
            stack: [
              { text: "SONOV", style: "brand", color: slate },
              { text: "Smart CRM", color: indigo, fontSize: 9, margin: [0, 2, 0, 0] },
            ],
          },
          {
            alignment: "right",
            stack: [
              { text: invoice.invoice_type.toUpperCase() + " INVOICE", style: "doctype", color: slate },
              { text: `#${invoice.invoice_number}`, color: indigo, fontSize: 11 },
            ],
          },
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 2, lineColor: slate }] },
      {
        columns: [
          {
            stack: [
              { text: "BILLED TO", style: "label", color: indigo },
              { text: lead.client_name, bold: true, fontSize: 13, margin: [0, 4, 0, 0] },
              { text: lead.email, color: "#555" },
            ],
            margin: [0, 24, 0, 0],
          },
          {
            alignment: "right",
            stack: [
              { text: "Issue date", style: "label", color: indigo },
              { text: invoice.issue_date, margin: [0, 2, 0, 8] },
              { text: "Due date", style: "label", color: indigo },
              { text: invoice.due_date },
            ],
            margin: [0, 24, 0, 0],
          },
        ],
      },
      {
        margin: [0, 32, 0, 0],
        table: {
          widths: ["*", 80, 100],
          body: [
            [
              { text: "Description", style: "th", fillColor: slate, color: "#fff" },
              { text: "Qty", style: "th", fillColor: slate, color: "#fff", alignment: "right" },
              { text: "Amount", style: "th", fillColor: slate, color: "#fff", alignment: "right" },
            ],
            [
              {
                stack: [
                  {
                    text:
                      invoice.invoice_type === "Proforma"
                        ? "Reservation fee / deposit"
                        : "Real estate transaction fee",
                    bold: true,
                  },
                  { text: `${lead.property_type} — ${lead.client_name}`, color: "#666", fontSize: 9 },
                ],
              },
              { text: "1", alignment: "right" },
              { text: euro(invoice.amount), alignment: "right" },
            ],
          ],
        },
        layout: { hLineColor: "#ddd", vLineColor: "#ddd" },
      },
      {
        margin: [0, 16, 0, 0],
        columns: [
          { text: "" },
          {
            width: 220,
            table: {
              widths: ["*", "auto"],
              body: [
                [{ text: "Subtotal", color: "#555" }, { text: euro(invoice.amount), alignment: "right" }],
                [{ text: "VAT (0%)", color: "#555" }, { text: euro(0), alignment: "right" }],
                [
                  { text: "Total due", bold: true, color: slate, fillColor: "#eef2ff" },
                  { text: euro(invoice.amount), alignment: "right", bold: true, color: slate, fillColor: "#eef2ff" },
                ],
              ],
            },
            layout: "noBorders",
          },
        ],
      },
      ...(invoice.status === "Paid"
        ? [
            {
              margin: [0, 24, 0, 0],
              table: {
                widths: ["*"],
                body: [
                  [
                    {
                      text: "PAID  ✓",
                      alignment: "center",
                      fillColor: mint,
                      color: "#fff",
                      bold: true,
                      fontSize: 14,
                      margin: [0, 8, 0, 8],
                    },
                  ],
                ],
              },
              layout: "noBorders",
            },
          ]
        : []),
      { text: invoice.notes ?? "", margin: [0, 24, 0, 0], color: "#555", fontSize: 9 },
      {
        absolutePosition: { x: 40, y: 780 },
        text: "SONOV Smart CRM · contact@sonov.example · VAT EU-0000-0000",
        color: "#999",
        fontSize: 8,
      },
    ],
    styles: {
      brand: { fontSize: 22, bold: true, characterSpacing: 4 },
      doctype: { fontSize: 13, bold: true, characterSpacing: 2 },
      label: { fontSize: 9, characterSpacing: 1, bold: true },
      th: { bold: true, fontSize: 10, margin: [0, 6, 0, 6] },
    },
    defaultStyle: { fontSize: 10, color: "#1f2937" },
  };
}

function euro(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

export async function downloadInvoicePdf(invoice: InvoiceRow, lead: LeadLite) {
  const pdfMake = await getPdfMake();
  pdfMake.createPdf(buildInvoiceDoc(invoice, lead)).download(`${invoice.invoice_number}.pdf`);
}

export async function generateAndUploadInvoicePdf(invoice: InvoiceRow, lead: LeadLite) {
  const pdfMake = await getPdfMake();
  const blob: Blob = await new Promise((resolve) =>
    pdfMake.createPdf(buildInvoiceDoc(invoice, lead)).getBlob((b: Blob) => resolve(b)),
  );
  const path = `${invoice.lead_id}/${invoice.invoice_number}.pdf`;
  const { error } = await supabase.storage
    .from("invoices")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  await supabase.from("invoices").update({ pdf_path: path }).eq("id", invoice.id);
  return path;
}

// ---------- Contract ----------
type ContractLead = {
  id: string;
  client_name: string;
  email: string;
  property_type: string;
  budget?: number | null;
};

export function buildContractDoc(lead: ContractLead) {
  const slate = "#2c3a6b";
  const indigo = "#4338ca";
  const today = new Date().toLocaleDateString("fr-FR");
  return {
    pageMargins: [50, 60, 50, 70] as [number, number, number, number],
    content: [
      { text: "SONOV", style: "brand", color: slate },
      { text: "Smart CRM", color: indigo, fontSize: 9, margin: [0, 2, 0, 0] },
      { canvas: [{ type: "line", x1: 0, y1: 8, x2: 495, y2: 8, lineWidth: 2, lineColor: slate }] },
      { text: "CONTRAT DE TRANSACTION IMMOBILIÈRE", style: "title", color: slate, margin: [0, 24, 0, 16] },
      {
        text: [
          { text: "Entre les soussignés :\n\n", bold: true },
          "SONOV Smart CRM, ci-après dénommée « l'Agence »,\net\n",
          { text: `${lead.client_name}`, bold: true },
          ` (${lead.email}), ci-après dénommé(e) « le Client ».\n\n`,
        ],
      },
      { text: "Article 1 — Objet", style: "h2", color: indigo, margin: [0, 14, 0, 6] },
      {
        text: `Le présent contrat a pour objet l'accompagnement du Client dans la transaction d'un bien de type ${lead.property_type}${
          lead.budget ? ` pour un budget de référence de ${euro(lead.budget)}` : ""
        }.`,
      },
      { text: "Article 2 — Obligations de l'Agence", style: "h2", color: indigo, margin: [0, 14, 0, 6] },
      { text: "L'Agence s'engage à conseiller le Client, vérifier la conformité des documents et coordonner la signature finale du compromis." },
      { text: "Article 3 — Obligations du Client", style: "h2", color: indigo, margin: [0, 14, 0, 6] },
      { text: "Le Client s'engage à fournir les documents requis et à régler les honoraires figurant sur la facture finale émise par l'Agence." },
      { text: "Article 4 — Signature", style: "h2", color: indigo, margin: [0, 14, 0, 6] },
      { text: `Le Client confirme accepter les termes du présent contrat en y apposant sa signature manuscrite ou électronique. Daté du ${today}.` },
      {
        margin: [0, 40, 0, 0],
        columns: [
          {
            stack: [
              { text: "L'Agence", bold: true, color: slate },
              { canvas: [{ type: "line", x1: 0, y1: 50, x2: 180, y2: 50, lineWidth: 1, lineColor: "#999" }] },
              { text: "SONOV Smart CRM", fontSize: 9, color: "#666", margin: [0, 4, 0, 0] },
            ],
          },
          {
            stack: [
              { text: "Le Client", bold: true, color: slate },
              { canvas: [{ type: "line", x1: 0, y1: 50, x2: 180, y2: 50, lineWidth: 1, lineColor: "#999" }] },
              { text: lead.client_name, fontSize: 9, color: "#666", margin: [0, 4, 0, 0] },
            ],
          },
        ],
      },
      {
        absolutePosition: { x: 50, y: 780 },
        text: "SONOV Smart CRM · contact@sonov.example · VAT EU-0000-0000",
        color: "#999",
        fontSize: 8,
      },
    ],
    styles: {
      brand: { fontSize: 22, bold: true, characterSpacing: 4 },
      title: { fontSize: 16, bold: true, alignment: "center" },
      h2: { fontSize: 11, bold: true },
    },
    defaultStyle: { fontSize: 10, color: "#1f2937", lineHeight: 1.4 },
  };
}

export async function generateAndUploadContractPdf(lead: ContractLead) {
  const pdfMake = await getPdfMake();
  const blob: Blob = await new Promise((resolve) =>
    pdfMake.createPdf(buildContractDoc(lead)).getBlob((b: Blob) => resolve(b)),
  );
  const path = `${lead.id}/contract-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from("lead-documents")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  return path;
}

export async function downloadStoragePdf(bucket: "lead-documents" | "invoices", path: string, filename: string) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

