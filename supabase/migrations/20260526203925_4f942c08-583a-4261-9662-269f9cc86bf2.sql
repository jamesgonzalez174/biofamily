
CREATE TABLE public.zoho_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_org_id text NOT NULL UNIQUE,
  zoho_org_name text,
  region text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  connected_by uuid,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoho_connections TO authenticated;
GRANT ALL ON public.zoho_connections TO service_role;

ALTER TABLE public.zoho_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read zoho_connections"
  ON public.zoho_connections FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage zoho_connections"
  ON public.zoho_connections FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER tg_zoho_connections_updated_at
  BEFORE UPDATE ON public.zoho_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
