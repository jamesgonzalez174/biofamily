
CREATE TABLE public.user_pharmacy_access (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pharmacy_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_pharmacy_access TO authenticated;
GRANT ALL ON public.user_pharmacy_access TO service_role;

ALTER TABLE public.user_pharmacy_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own access" ON public.user_pharmacy_access
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all access" ON public.user_pharmacy_access
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage access" ON public.user_pharmacy_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_user_pharmacy_access_user ON public.user_pharmacy_access(user_id);
CREATE INDEX idx_user_pharmacy_access_pharmacy ON public.user_pharmacy_access(pharmacy_id);
