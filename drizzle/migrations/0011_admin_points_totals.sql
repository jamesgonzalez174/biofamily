CREATE OR REPLACE FUNCTION public.admin_points_totals()
RETURNS TABLE(issued bigint, spent bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT COALESCE(SUM(delta) FILTER (WHERE delta > 0),0)::bigint,
                      COALESCE(-SUM(delta) FILTER (WHERE delta < 0),0)::bigint
               FROM public.points_ledger;
END $$;
REVOKE ALL ON FUNCTION public.admin_points_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_points_totals() TO authenticated;