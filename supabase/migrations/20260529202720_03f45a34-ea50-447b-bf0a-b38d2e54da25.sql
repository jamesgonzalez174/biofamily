-- 1) Restrict redemptions INSERT via RLS (defense in depth; create_redemption SECURITY DEFINER still works)
CREATE POLICY "Users insert own redemptions"
ON public.redemptions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 2) Add admin-only SELECT/ALL policy on zoho_connections (currently has RLS enabled but no policy)
CREATE POLICY "Admins read zoho_connections"
ON public.zoho_connections
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage zoho_connections"
ON public.zoho_connections
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));