CREATE POLICY "lead-docs insert by staff" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'lead-documents' AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id::text = split_part(objects.name, '/', 1)
      AND (public.has_role(auth.uid(), 'admin') OR l.assigned_agent_id = auth.uid())
  )
);