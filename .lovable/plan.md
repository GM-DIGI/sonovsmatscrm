# Real Estate CRM & Client Portal — Build Plan

## 1. Backend (Lovable Cloud / Supabase)

Enable Lovable Cloud, then create schema via migration:

- `app_role` enum: `admin`, `agent`, `client`
- `lead_status` enum: `New`, `Qualified`, `Viewing Scheduled`, `Offer Made`, `Contract Pending`, `Signed & Closed`
- `doc_type` enum: `ID`, `Proof of Address`, `Proof of Income`, `Payslip`, `Tax Statement`
- `doc_status` enum: `Pending`, `Approved`, `Rejected`
- `invoice_type` enum: `Proforma`, `Standard`
- `invoice_status` enum: `Draft`, `Sent`, `Paid`, `Overdue`
- `property_type` enum: `Appartement`, `Villa`, `Bureau`

Tables (each with `GRANT`s + RLS):
- `profiles` (id ← auth.users, name, email, phone)
- `user_roles` (user_id, role) — separate roles table per security rules; `has_role(uuid, app_role)` security-definer fn
- `leads` (id, client_name, email, phone, budget numeric, property_type, status, assigned_agent_id, client_user_id nullable, locked bool default false, created_at)
- `lead_activities` (id, lead_id, author_id, kind, note, created_at) — interaction log
- `documents` (id, lead_id, document_type, file_path, status, rejection_reason, uploaded_at, reviewed_at)
- `invoices` (id, lead_id, invoice_type, invoice_number unique, amount, issue_date, due_date, status, pdf_path, created_at)
- `notifications` (id, user_id, lead_id, message, read, created_at) — for rejection alerts
- `client_invites` (id, lead_id, email, token, used, expires_at)

Storage buckets (private): `lead-documents`, `invoices`. Signed URLs for downloads.

### RLS (multi-agent isolation)
- Agents: SELECT/UPDATE on `leads` WHERE `assigned_agent_id = auth.uid()`; SELECT/INSERT/UPDATE on child tables joined via owned leads.
- Admins (`has_role(auth.uid(),'admin')`): full access.
- Clients (`has_role(...,'client')`): SELECT own lead (`client_user_id = auth.uid()`), SELECT own documents/invoices, INSERT documents for own lead.

## 2. Auth

- Email/password signup at `/auth`. New users get a `profiles` row via trigger; no automatic role assignment (manual via SQL per user choice).
- Client onboarding: agent clicks "Invite Client" in lead drawer → server fn generates token + sends magic link via `supabase.auth.admin.inviteUserByEmail` → on first sign-in a trigger links `auth.user.id` to `leads.client_user_id` matching email and assigns `client` role.
- Protected app at `/_authenticated/*`; role-aware redirect: admins/agents → `/dashboard`, clients → `/portal`.

## 3. Agent/Admin Dashboard (`/_authenticated/dashboard`)

- Sidebar nav: Pipeline, Leads, Invoices, (Admin only) Agents & Metrics.
- **Kanban** (`@dnd-kit/core`): 6 columns = statuses; cards show client, budget, property type, doc-completion ring, agent avatar (admin view). Drag updates status via server fn. Admin sees all; agent sees own only (enforced by RLS).
- **Lead drawer** (Sheet) with tabs:
  - *Overview & Activity*: client info, editable fields, activity timeline + "Log interaction" composer.
  - *Documents Review*: list per `document_type` with thumbnail/preview, Approve / Reject (textarea required) → writes `notifications` row + email-style toast.
  - *Finances & Contracts*:
    - "Generate Proforma" (enabled when status ≥ `Offer Made`)
    - "Generate Final Invoice" (enabled when status ≥ `Contract Pending`)
    - "Send to Yousign" (disabled until all required docs `Approved`) → sets status `Contract Pending`, badge "Awaiting Signature"
    - "Simulate Client Signature & Payment" (dev button) → status `Signed & Closed`, final invoice `Paid`, confetti, `leads.locked=true` (RLS blocks further writes to docs/invoices for that lead)
- Admin metrics page: lead counts per status, per agent, invoice totals (paid/outstanding), conversion funnel.

## 4. Client Portal (`/_authenticated/portal`)

- **Journey stepper**: 6-step horizontal progress bar with current status highlighted in mint.
- **Document upload center**: required slots (ID, Proof of Address, 3× Payslip). Drag-drop → uploads to `lead-documents` bucket → row in `documents`. Status badge per file: Pending/Approved/Rejected (+ reason banner). Re-upload allowed unless lead `locked`.
- **My Invoices & Documents safe**: list of invoices with type, number, amount, status, issue/due date, Download (signed URL) and View (in-app branded layout).
- Notifications bell pulling from `notifications`.

## 5. Invoices & PDFs

- "Generate Invoice" opens a modal: amount, due date, line items (prefilled from lead). On confirm, server fn renders branded HTML invoice (logo, slate/indigo header, mint accents, totals) → converts to PDF via `pdfmake` (Worker-compatible, pure JS) → uploads to `invoices` bucket → inserts `invoices` row with `pdf_path` and unique `invoice_number` (`PRO-YYYY-####` / `INV-YYYY-####`).
- In-app invoice viewer renders the same React component used for PDF (single source of truth).
- Download = signed URL from storage.

## 6. Design System

- Tokens in `src/styles.css` (oklch): primary slate-blue `oklch(0.45 0.08 250)`, accent deep indigo `oklch(0.35 0.15 275)`, success mint/emerald `oklch(0.72 0.17 165)`, warning amber, destructive rose. Neutral surface near-white with subtle slate tint; dark mode supported.
- Typography: Inter for UI, Fraunces for headings (premium feel).
- Components: shadcn (Card, Sheet, Tabs, Dialog, Badge, Progress, Table, Sonner toasts). Subtle motion via `framer-motion` for drawer/kanban; `canvas-confetti` for payment success.
- Fully responsive: Kanban becomes horizontally scrollable on mobile; drawer becomes full-screen sheet.

## 7. Routes

```
/                              landing (marketing-lite, CTA → /auth)
/auth                          signup / login / magic-link callback
/_authenticated/dashboard      Kanban (admin + agent)
/_authenticated/leads          table view
/_authenticated/leads/$id      deep link opening drawer
/_authenticated/invoices       all invoices (scoped by role)
/_authenticated/metrics        admin only
/_authenticated/portal         client journey + uploads + invoices
```

## Technical Notes

- Server fns in `src/lib/*.functions.ts` (`requireSupabaseAuth` middleware): `updateLeadStatus`, `logActivity`, `reviewDocument`, `generateInvoice`, `sendToYousign`, `simulateSignatureAndPayment`, `inviteClient`, `getSignedUrl`.
- Bearer attacher in `src/start.ts`.
- Realtime subscription on `leads` + `documents` + `notifications` for live Kanban/portal updates.
- All status transitions go through server fns that re-check role + ownership server-side (defense in depth on top of RLS).
- `leads.locked=true` enforced via RLS USING clause on `documents`/`invoices` UPDATE policies.

## Out of scope (mocked)

- Real Yousign API (badge + status transition only).
- Real payment processor (simulate button).
- Email delivery beyond Supabase auth magic links.
