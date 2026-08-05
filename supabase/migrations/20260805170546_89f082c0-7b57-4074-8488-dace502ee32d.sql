ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS sync_points_invoices boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sync_all_invoices boolean NOT NULL DEFAULT false;