
CREATE OR REPLACE FUNCTION public.list_status_viewers(_status_id UUID)
RETURNS TABLE(user_id UUID, email TEXT, full_name TEXT, viewed_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT sv.user_id, p.email, p.full_name, sv.viewed_at
  FROM public.status_views sv
  LEFT JOIN public.profiles p ON p.id = sv.user_id
  WHERE sv.status_id = _status_id
  ORDER BY sv.viewed_at DESC;
END;
$$;
