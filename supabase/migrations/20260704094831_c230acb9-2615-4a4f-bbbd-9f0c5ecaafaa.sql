
-- 1. Add Airtable record ID column to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS airtable_record_id text;

-- 2. Ensure pg_net is enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3. Trigger function that fires the sync endpoint
CREATE OR REPLACE FUNCTION public.sync_lead_to_airtable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  endpoint_url text := 'https://sonovsmatscrm.lovable.app/api/public/hooks/airtable-sync-lead';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjcWxvZ2FqdnpxYWh6d3N5cnBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NTkzMDMsImV4cCI6MjA5ODIzNTMwM30.Xa9S2mo0oWdqP0hoc0ZEZjhA2C0ScfLWuLK6wJSjO84';
BEGIN
  -- Skip if only the airtable_record_id itself changed (avoid infinite loop)
  IF TG_OP = 'UPDATE' AND NEW.airtable_record_id IS DISTINCT FROM OLD.airtable_record_id
     AND NEW.client_name IS NOT DISTINCT FROM OLD.client_name
     AND NEW.email IS NOT DISTINCT FROM OLD.email
     AND NEW.phone IS NOT DISTINCT FROM OLD.phone
     AND NEW.budget IS NOT DISTINCT FROM OLD.budget
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.property_type IS NOT DISTINCT FROM OLD.property_type
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.source IS NOT DISTINCT FROM OLD.source
     AND NEW.campaign IS NOT DISTINCT FROM OLD.campaign
     AND NEW.ai_score IS NOT DISTINCT FROM OLD.ai_score
  THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', anon_key
    ),
    body := jsonb_build_object(
      'leadId', NEW.id::text,
      'operation', TG_OP
    )
  );
  RETURN NEW;
END;
$$;

-- 4. Trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_sync_lead_to_airtable ON public.leads;
CREATE TRIGGER trg_sync_lead_to_airtable
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.sync_lead_to_airtable();
