CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_zoho_unique
ON public.points_ledger (reference, user_id)
WHERE source = 'zoho';