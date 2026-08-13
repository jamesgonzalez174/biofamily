CREATE OR REPLACE FUNCTION public.admin_list_pharmacies(_search text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, address text, is_active boolean, zoho_contact_id text, loyalty_points integer, history_points integer, invoice_references text[], member_count integer, member_loyalty integer, member_history integer, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
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
         COALESCE(f.invoice_references, '{}'::text[]),
         COALESCE(t.members, 0),
         COALESCE(t.loyalty, 0),
         COALESCE(t.history, 0),
         (SELECT c FROM total)
  FROM filtered f
  LEFT JOIN totals t ON t.pharmacy_id = f.id
  ORDER BY f.name
  LIMIT _limit OFFSET _offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_pharmacies(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pharmacies(text, integer, integer) TO authenticated;

-- list_status_viewers is already SECURITY INVOKER; keep anon locked out.
REVOKE ALL ON FUNCTION public.list_status_viewers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_status_viewers(uuid) TO authenticated;