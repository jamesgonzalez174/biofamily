ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS zoho_contact_id text;

CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_zoho_contact_id_key
  ON public.pharmacies (zoho_contact_id)
  WHERE zoho_contact_id IS NOT NULL;