
-- 1) Scoring IA sur leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_score smallint,
  ADD COLUMN IF NOT EXISTS ai_score_reason text,
  ADD COLUMN IF NOT EXISTS ai_scored_at timestamptz;

-- 2) Copilote IA : threads + messages (par utilisateur staff)
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nouvelle conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads" ON public.chat_threads
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER chat_threads_touch BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  parts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own thread msgs" ON public.chat_messages
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON public.chat_messages(thread_id, created_at);

-- 3) Messagerie client <-> agent par lead
CREATE TABLE IF NOT EXISTS public.lead_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_kind text NOT NULL CHECK (sender_kind IN ('client','agent','admin')),
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.lead_messages TO authenticated;
GRANT ALL ON public.lead_messages TO service_role;
ALTER TABLE public.lead_messages ENABLE ROW LEVEL SECURITY;

-- Lecture : admin global, agent assigné, client propriétaire du lead
CREATE POLICY "read lead msgs" ON public.lead_messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND (l.assigned_agent_id = auth.uid() OR l.client_user_id = auth.uid())
    )
  );

-- Envoi : sender = auth.uid() et appartient au lead
CREATE POLICY "send lead msgs" ON public.lead_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND (l.assigned_agent_id = auth.uid() OR l.client_user_id = auth.uid())
      )
    )
  );

-- Mise à jour (marquer comme lu)
CREATE POLICY "update lead msgs" ON public.lead_messages
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND (l.assigned_agent_id = auth.uid() OR l.client_user_id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS lead_messages_lead_idx ON public.lead_messages(lead_id, created_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_messages;
