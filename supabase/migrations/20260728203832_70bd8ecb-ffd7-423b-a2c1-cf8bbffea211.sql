REVOKE EXECUTE ON FUNCTION public.distribute_invoice_points_once(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distribute_invoice_points_once(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.distribute_invoice_points_once(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribute_invoice_points_once(uuid) TO service_role;