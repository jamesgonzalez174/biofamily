DROP VIEW IF EXISTS public.pharmacy_directory;

CREATE TABLE public.pharmacy_directory (
  id uuid PRIMARY KEY REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pharmacy_directory TO anon, authenticated;
GRANT ALL ON public.pharmacy_directory TO service_role;

ALTER TABLE public.pharmacy_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read the pharmacy directory"
ON public.pharmacy_directory FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.sync_pharmacy_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.pharmacy_directory WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.is_active THEN
    INSERT INTO public.pharmacy_directory (id, name, address, updated_at)
    VALUES (NEW.id, NEW.name, NEW.address, now())
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, updated_at = now();
  ELSE
    DELETE FROM public.pharmacy_directory WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_pharmacy_directory() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tg_pharmacies_sync_directory
AFTER INSERT OR UPDATE OR DELETE ON public.pharmacies
FOR EACH ROW EXECUTE FUNCTION public.sync_pharmacy_directory();

INSERT INTO public.pharmacy_directory (id, name, address)
SELECT id, name, address FROM public.pharmacies WHERE is_active
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address;