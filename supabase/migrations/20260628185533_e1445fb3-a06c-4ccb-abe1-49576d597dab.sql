
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS campaign TEXT;

CREATE INDEX IF NOT EXISTS leads_campaign_idx ON public.leads(campaign);
