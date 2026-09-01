ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS invoice_sync_start_date date NOT NULL DEFAULT '2026-09-01';

UPDATE public.settings SET invoice_sync_start_date = '2026-09-01' WHERE id = 1;