DROP INDEX IF EXISTS public.points_ledger_source_ref_user_uniq;

CREATE UNIQUE INDEX points_ledger_source_ref_user_uniq
  ON public.points_ledger (source, reference, user_id)
  WHERE reference IS NOT NULL AND source <> 'zoho_sync';