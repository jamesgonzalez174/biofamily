-- 1. Storage: remove broad public SELECT policies (these enabled listing all files)
DROP POLICY IF EXISTS "Public read prize images" ON storage.objects;
DROP POLICY IF EXISTS "Public read statuses bucket" ON storage.objects;

-- Signed-in users only may read status objects (bucket becomes private; served via signed URLs)
CREATE POLICY "Authenticated read statuses bucket"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'statuses');

-- 2. Revoke direct client EXECUTE on SECURITY DEFINER functions only invoked server-side
REVOKE EXECUTE ON FUNCTION public.create_redemption(uuid, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.create_redemption(uuid, uuid, text, text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.retry_dlq_message(text) FROM authenticated, anon;