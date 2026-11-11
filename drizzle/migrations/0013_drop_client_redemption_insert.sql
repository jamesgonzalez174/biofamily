DROP POLICY IF EXISTS "Users insert own redemptions" ON public.redemptions;
REVOKE INSERT ON public.redemptions FROM authenticated, anon;