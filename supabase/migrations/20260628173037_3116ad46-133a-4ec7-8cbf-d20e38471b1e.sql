
-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('admin','agent','client');
CREATE TYPE public.lead_status AS ENUM ('New','Qualified','Viewing Scheduled','Offer Made','Contract Pending','Signed & Closed');
CREATE TYPE public.property_type AS ENUM ('Appartement','Villa','Bureau');
CREATE TYPE public.doc_type AS ENUM ('ID','Proof of Address','Proof of Income','Payslip','Tax Statement');
CREATE TYPE public.doc_status AS ENUM ('Pending','Approved','Rejected');
CREATE TYPE public.invoice_type AS ENUM ('Proforma','Standard');
CREATE TYPE public.invoice_status AS ENUM ('Draft','Sent','Paid','Overdue');

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============= USER ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'agent' THEN 2 ELSE 3 END LIMIT 1
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email
  );
  -- If invited as client (metadata says so) link to a lead, otherwise grant agent by default-- nope: leave roles to admin
  IF COALESCE(NEW.raw_user_meta_data->>'invited_as','') = 'client' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client') ON CONFLICT DO NOTHING;
    UPDATE public.leads SET client_user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND client_user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ============= LEADS =============
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  budget NUMERIC(12,2),
  property_type property_type NOT NULL DEFAULT 'Appartement',
  status lead_status NOT NULL DEFAULT 'New',
  assigned_agent_id UUID REFERENCES auth.users ON DELETE SET NULL,
  client_user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  notes TEXT,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_agent_idx ON public.leads(assigned_agent_id);
CREATE INDEX leads_client_idx ON public.leads(client_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access leads" ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Agents read own leads" ON public.leads FOR SELECT TO authenticated
  USING (assigned_agent_id = auth.uid());
CREATE POLICY "Agents update own leads" ON public.leads FOR UPDATE TO authenticated
  USING (assigned_agent_id = auth.uid() AND NOT locked) WITH CHECK (assigned_agent_id = auth.uid());
CREATE POLICY "Agents insert leads" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'agent') AND assigned_agent_id = auth.uid());
CREATE POLICY "Clients read own lead" ON public.leads FOR SELECT TO authenticated
  USING (client_user_id = auth.uid());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= ACTIVITIES =============
CREATE TABLE public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activities_lead_idx ON public.lead_activities(lead_id);
GRANT SELECT, INSERT ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Activities visible if lead visible" ON public.lead_activities FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (
    public.has_role(auth.uid(),'admin') OR l.assigned_agent_id = auth.uid() OR l.client_user_id = auth.uid()
  ))
);
CREATE POLICY "Activities insert by staff" ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (
    public.has_role(auth.uid(),'admin') OR l.assigned_agent_id = auth.uid()
  ))
);

-- ============= DOCUMENTS =============
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads ON DELETE CASCADE,
  document_type doc_type NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  status doc_status NOT NULL DEFAULT 'Pending',
  rejection_reason TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX documents_lead_idx ON public.documents(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Docs select if lead visible" ON public.documents FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (
    public.has_role(auth.uid(),'admin') OR l.assigned_agent_id = auth.uid() OR l.client_user_id = auth.uid()
  ))
);
CREATE POLICY "Clients upload docs to own lead" ON public.documents FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.client_user_id = auth.uid() AND NOT l.locked)
);
CREATE POLICY "Staff manage docs" ON public.documents FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (
    public.has_role(auth.uid(),'admin') OR l.assigned_agent_id = auth.uid()
  ) AND NOT l.locked)
);
CREATE POLICY "Clients delete own pending docs" ON public.documents FOR DELETE TO authenticated USING (
  status = 'Pending' AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.client_user_id = auth.uid() AND NOT l.locked)
);

-- ============= INVOICES =============
CREATE SEQUENCE public.invoice_seq START 1000;
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads ON DELETE CASCADE,
  invoice_type invoice_type NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  status invoice_status NOT NULL DEFAULT 'Draft',
  pdf_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoices_lead_idx ON public.invoices(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invoices select if lead visible" ON public.invoices FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (
    public.has_role(auth.uid(),'admin') OR l.assigned_agent_id = auth.uid() OR l.client_user_id = auth.uid()
  ))
);
CREATE POLICY "Staff manage invoices" ON public.invoices FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (
    public.has_role(auth.uid(),'admin') OR l.assigned_agent_id = auth.uid()
  ))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (
    public.has_role(auth.uid(),'admin') OR l.assigned_agent_id = auth.uid()
  ))
);

-- ============= NOTIFICATIONS =============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Staff insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent')
);

-- Trigger on new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activities;
