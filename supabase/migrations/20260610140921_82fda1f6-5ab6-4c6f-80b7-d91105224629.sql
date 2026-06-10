ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pharmacy_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pharmacy_id_fkey
  FOREIGN KEY (pharmacy_id) REFERENCES public.pharmacies(id) ON DELETE RESTRICT;