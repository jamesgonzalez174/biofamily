CREATE TABLE public.zoho_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  fetched integer NOT NULL DEFAULT 0,
  upserted integer NOT NULL DEFAULT 0,
  pages integer NOT NULL DEFAULT 0,
  truncated boolean NOT NULL DEFAULT false,
  notified_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  triggered_by uuid
);

GRANT SELECT ON public.zoho_sync_runs TO authenticated;
GRANT ALL ON public.zoho_sync_runs TO service_role;

ALTER TABLE public.zoho_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read sync runs"
ON public.zoho_sync_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_zoho_sync_runs_started_at ON public.zoho_sync_runs (started_at DESC);
