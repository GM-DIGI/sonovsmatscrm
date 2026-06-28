
-- lead-documents bucket: path convention = "<lead_id>/<filename>"
CREATE POLICY "lead-docs select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lead-documents' AND EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id::text = split_part(name,'/',1) AND (
      public.has_role(auth.uid(),'admin') OR l.assigned_agent_id = auth.uid() OR l.client_user_id = auth.uid()
    )
  )
);
CREATE POLICY "lead-docs insert by client" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'lead-documents' AND EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id::text = split_part(name,'/',1)
      AND l.client_user_id = auth.uid() AND NOT l.locked
  )
);
CREATE POLICY "lead-docs delete by client pending" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'lead-documents' AND EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id::text = split_part(name,'/',1)
      AND l.client_user_id = auth.uid() AND NOT l.locked
  )
);

-- invoices bucket: path convention = "<lead_id>/<invoice_number>.pdf"
CREATE POLICY "invoices select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoices' AND EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id::text = split_part(name,'/',1) AND (
      public.has_role(auth.uid(),'admin') OR l.assigned_agent_id = auth.uid() OR l.client_user_id = auth.uid()
    )
  )
);
CREATE POLICY "invoices insert by staff" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'invoices' AND EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id::text = split_part(name,'/',1) AND (
      public.has_role(auth.uid(),'admin') OR l.assigned_agent_id = auth.uid()
    )
  )
);
