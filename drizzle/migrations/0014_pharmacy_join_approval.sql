ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_pharmacy_id uuid REFERENCES public.pharmacies(id) ON DELETE SET NULL;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, requested_pharmacy_id) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_member_pharmacy(_user_id uuid, _pharmacy_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles SET pharmacy_id = _pharmacy_id, requested_pharmacy_id = NULL WHERE id = _user_id;
  INSERT INTO public.admin_audit_log(actor_user_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'set_member_pharmacy', 'profile', _user_id::text, jsonb_build_object('pharmacy_id', _pharmacy_id));
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_member_pharmacy(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_member_pharmacy(uuid, uuid) TO authenticated;