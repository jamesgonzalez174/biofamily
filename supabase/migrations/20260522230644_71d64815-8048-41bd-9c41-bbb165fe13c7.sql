ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS loyalty_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS history_points integer NOT NULL DEFAULT 0;