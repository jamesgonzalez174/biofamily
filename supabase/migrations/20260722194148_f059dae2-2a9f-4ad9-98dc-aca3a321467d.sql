
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS points_given boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_points integer,
  ADD COLUMN IF NOT EXISTS points_distributed_at timestamptz;

CREATE INDEX IF NOT EXISTS invoices_points_given_idx ON public.invoices (points_given) WHERE points_given = true;
