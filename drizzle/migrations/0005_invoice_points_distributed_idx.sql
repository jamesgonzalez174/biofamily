-- Speeds up sync/backfill lookups that find invoices that have (or have not yet) distributed points
CREATE INDEX IF NOT EXISTS idx_invoices_points_distributed
  ON public.invoices (points_distributed_at)
  WHERE points_distributed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_points_undistributed
  ON public.invoices (points_distributed_at)
  WHERE points_distributed_at IS NULL;