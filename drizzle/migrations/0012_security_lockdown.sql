REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (pharmacy_id, full_name) ON public.profiles TO authenticated;

CREATE TABLE public.zoho_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.zoho_oauth_states TO service_role;
ALTER TABLE public.zoho_oauth_states ENABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;