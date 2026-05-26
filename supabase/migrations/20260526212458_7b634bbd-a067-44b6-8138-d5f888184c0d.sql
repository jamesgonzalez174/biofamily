CREATE OR REPLACE FUNCTION public.admin_list_pharmacies(_search text DEFAULT NULL, _limit int DEFAULT 50, _offset int DEFAULT 0)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  is_active boolean,
  zoho_contact_id text,
  loyalty_points integer,
  history_points integer,
  member_count integer,
  member_loyalty integer,
  member_history integer,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT p.*
    FROM public.pharmacies p
    WHERE _search IS NULL OR _search = ''
       OR p.name ILIKE '%' || _search || '%'
       OR COALESCE(p.address, '') ILIKE '%' || _search || '%'
  ),
  totals AS (
    SELECT pr.pharmacy_id,
           COUNT(*)::int AS members,
           COALESCE(SUM(pr.points_balance), 0)::int AS loyalty,
           COALESCE(SUM(pr.lifetime_points), 0)::int AS history
    FROM public.profiles pr
    WHERE pr.pharmacy_id IS NOT NULL
    GROUP BY pr.pharmacy_id
  ),
  total AS (SELECT COUNT(*)::bigint AS c FROM filtered)
  SELECT f.id, f.name, f.address, f.is_active, f.zoho_contact_id,
         f.loyalty_points, f.history_points,
         COALESCE(t.members, 0),
         COALESCE(t.loyalty, 0),
         COALESCE(t.history, 0),
         (SELECT c FROM total)
  FROM filtered f
  LEFT JOIN totals t ON t.pharmacy_id = f.id
  ORDER BY f.name
  LIMIT _limit OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_pharmacies(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pharmacies(text, int, int) TO authenticated, service_role;