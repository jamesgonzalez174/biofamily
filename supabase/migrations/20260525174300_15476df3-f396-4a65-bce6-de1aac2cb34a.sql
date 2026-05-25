CREATE OR REPLACE FUNCTION public.prevent_pharmacy_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.pharmacy_id IS NOT NULL
     AND NEW.pharmacy_id IS DISTINCT FROM OLD.pharmacy_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Pharmacy cannot be changed once set. Contact an admin.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_pharmacy_change ON public.profiles;
CREATE TRIGGER profiles_prevent_pharmacy_change
BEFORE UPDATE OF pharmacy_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_pharmacy_change();

REVOKE EXECUTE ON FUNCTION public.prevent_pharmacy_change() FROM PUBLIC, anon, authenticated;