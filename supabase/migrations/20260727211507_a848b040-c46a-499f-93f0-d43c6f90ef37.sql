REVOKE EXECUTE ON FUNCTION public.create_redemption(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_redemption(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_redemption(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_redemption(uuid, uuid) TO authenticated, service_role;