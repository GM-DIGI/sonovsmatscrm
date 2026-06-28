ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contract_path TEXT,
  ADD COLUMN IF NOT EXISTS signed_contract_path TEXT,
  ADD COLUMN IF NOT EXISTS contract_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ;