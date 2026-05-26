DROP INDEX IF EXISTS public.pharmacies_zoho_contact_id_key;
ALTER TABLE public.pharmacies ADD CONSTRAINT pharmacies_zoho_contact_id_key UNIQUE (zoho_contact_id);