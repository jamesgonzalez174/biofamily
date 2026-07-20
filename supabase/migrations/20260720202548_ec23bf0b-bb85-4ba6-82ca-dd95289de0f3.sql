
CREATE TABLE public.status_views (
  status_id UUID NOT NULL REFERENCES public.statuses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (status_id, user_id)
);
CREATE INDEX status_views_status_idx ON public.status_views(status_id);
CREATE INDEX status_views_user_idx ON public.status_views(user_id);

GRANT SELECT, INSERT ON public.status_views TO authenticated;
GRANT ALL ON public.status_views TO service_role;

ALTER TABLE public.status_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own view"
  ON public.status_views FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users read own view"
  ON public.status_views FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins read all views"
  ON public.status_views FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.list_status_viewers(_status_id UUID)
RETURNS TABLE(user_id UUID, email TEXT, full_name TEXT, viewed_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.list_status_viewers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_status_viewers(UUID) TO authenticated;
