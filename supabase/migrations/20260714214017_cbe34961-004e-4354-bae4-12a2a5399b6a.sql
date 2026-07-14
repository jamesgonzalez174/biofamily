
-- 1) Revoke anonymous execute on retry_dlq_message (admin-only DEFINER function)
REVOKE EXECUTE ON FUNCTION public.retry_dlq_message(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_dlq_message(text) TO authenticated, service_role;

-- 2) Restrict pharmacy_id self-assignment via RLS. Users may only keep their existing
-- pharmacy_id; setting it from NULL to a value must go through the server (admin/trigger path).
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND points_balance = (SELECT p.points_balance FROM public.profiles p WHERE p.id = auth.uid())
  AND lifetime_points = (SELECT p.lifetime_points FROM public.profiles p WHERE p.id = auth.uid())
  AND tier = (SELECT p.tier FROM public.profiles p WHERE p.id = auth.uid())
  AND pharmacy_id IS NOT DISTINCT FROM (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
);
