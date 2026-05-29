REVOKE EXECUTE ON FUNCTION public.cancel_redemption(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_redemption(uuid) TO service_role;