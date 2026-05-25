
-- 1) Profiles: prevent self-elevation of points/tier
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND points_balance = (SELECT points_balance FROM public.profiles WHERE id = auth.uid())
  AND lifetime_points = (SELECT lifetime_points FROM public.profiles WHERE id = auth.uid())
  AND tier = (SELECT tier FROM public.profiles WHERE id = auth.uid())
);

-- 2) Redemptions: explicit INSERT policy restricted to self; admin-only updates/deletes
DROP POLICY IF EXISTS "Users insert own redemptions" ON public.redemptions;
CREATE POLICY "Users insert own redemptions"
ON public.redemptions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3) Statuses admin policy: scope to authenticated role instead of public
DROP POLICY IF EXISTS "Admins manage statuses" ON public.statuses;
CREATE POLICY "Admins manage statuses"
ON public.statuses FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4) SECURITY DEFINER functions: fix search_path and restrict EXECUTE
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pg_temp;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
