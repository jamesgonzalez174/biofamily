CREATE TABLE public.sales_reps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_reps TO authenticated;
GRANT ALL ON public.sales_reps TO service_role;
ALTER TABLE public.sales_reps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sales reps" ON public.sales_reps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.profiles ADD COLUMN referral_source text;
ALTER TABLE public.profiles ADD COLUMN sales_rep_id uuid REFERENCES public.sales_reps(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_referral_source_chk
  CHECK (referral_source IS NULL OR referral_source IN ('email','sales_rep','social_media','friend','pharmacy','other'));