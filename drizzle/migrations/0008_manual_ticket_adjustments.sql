CREATE OR REPLACE FUNCTION public.adjust_member_tickets(_user_id uuid, _delta integer, _reason text, _request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _profile public.profiles%ROWTYPE; _before integer; _after bigint; _existing jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _delta IS NULL OR _delta = 0 OR _reason IS NULL OR length(btrim(_reason)) NOT BETWEEN 1 AND 200 OR _request_id IS NULL THEN RAISE EXCEPTION 'A nonzero whole ticket adjustment and reason are required'; END IF;
 SELECT * INTO _profile FROM public.profiles WHERE id = _user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
 SELECT details INTO _existing FROM public.admin_audit_log WHERE id = _request_id AND actor_user_id = auth.uid() AND action = 'adjust_tickets' AND target_id = _user_id::text;
 IF FOUND THEN RETURN _existing; END IF;
 _before := _profile.tickets; _after := _before::bigint + _delta;
 IF _after < 0 OR _after > 2147483647 THEN RAISE EXCEPTION 'Ticket balance must be between 0 and 2147483647'; END IF;
 UPDATE public.profiles SET tickets = _after::integer WHERE id = _user_id;
 IF _profile.pharmacy_id IS NOT NULL THEN
 UPDATE public.pharmacies SET tickets = greatest(0, tickets::bigint + _delta)::integer WHERE id = _profile.pharmacy_id;
 END IF;
 INSERT INTO public.admin_audit_log(id, actor_user_id, actor_email, action, target_type, target_id, target_label, details)
 VALUES (_request_id, auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()), 'adjust_tickets', 'user', _user_id::text, coalesce(_profile.full_name, _profile.email), jsonb_build_object('delta', _delta, 'reason', btrim(_reason), 'previousBalance', _before, 'newBalance', _after));
 RETURN jsonb_build_object('previousBalance', _before, 'newBalance', _after);
END; $$;
REVOKE ALL ON FUNCTION public.adjust_member_tickets(uuid, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_member_tickets(uuid, integer, text, uuid) TO authenticated;