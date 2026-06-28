
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  matched_lead_id UUID;
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email
  );

  SELECT id INTO matched_lead_id FROM public.leads
    WHERE lower(email) = lower(NEW.email) AND client_user_id IS NULL LIMIT 1;

  IF matched_lead_id IS NOT NULL THEN
    UPDATE public.leads SET client_user_id = NEW.id WHERE id = matched_lead_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
