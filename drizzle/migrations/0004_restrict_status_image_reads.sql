DROP POLICY IF EXISTS "Authenticated read statuses bucket" ON storage.objects;
CREATE POLICY "Read active status images" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'statuses' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.statuses s
      WHERE s.expires_at > now()
        AND (s.image_url = storage.objects.name OR s.image_url LIKE '%/statuses/' || storage.objects.name OR s.image_url LIKE '%/statuses/' || storage.objects.name || '?%')
    )
  )
);