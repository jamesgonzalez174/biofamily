
CREATE TABLE public.pharmacies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed view active pharmacies" ON public.pharmacies
  FOR SELECT TO authenticated
  USING (is_active OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage pharmacies" ON public.pharmacies
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_pharmacies_updated_at BEFORE UPDATE ON public.pharmacies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.profiles ADD COLUMN pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE SET NULL;
CREATE INDEX idx_profiles_pharmacy ON public.profiles(pharmacy_id);

INSERT INTO public.pharmacies (name, address) VALUES
  ('Downtown Pharmacy', '123 Main St'),
  ('Riverside Health Pharmacy', '45 River Rd'),
  ('Sunset Care Pharmacy', '789 Sunset Blvd'),
  ('Greenfield Drugstore', '12 Greenfield Ave');
