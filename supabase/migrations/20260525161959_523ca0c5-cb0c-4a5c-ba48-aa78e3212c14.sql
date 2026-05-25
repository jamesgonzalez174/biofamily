
-- 1. Pharmacies: restrict public read to authenticated users only
DROP POLICY IF EXISTS "Public view active pharmacies" ON public.pharmacies;
CREATE POLICY "Authenticated view active pharmacies"
ON public.pharmacies
FOR SELECT
TO authenticated
USING (is_active OR has_role(auth.uid(), 'admin'::app_role));

-- 2. user_roles: tighten admin manage policy with explicit WITH CHECK and restrict to authenticated
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Revoke EXECUTE on SECURITY DEFINER functions from anon/public
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Fix mutable search_path on tg_set_updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;
