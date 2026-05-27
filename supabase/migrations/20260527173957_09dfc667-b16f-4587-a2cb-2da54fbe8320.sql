
REVOKE EXECUTE ON FUNCTION public.run_points_expiration() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_pharmacies(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_points_expiration() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_pharmacies(text, integer, integer) TO service_role;
