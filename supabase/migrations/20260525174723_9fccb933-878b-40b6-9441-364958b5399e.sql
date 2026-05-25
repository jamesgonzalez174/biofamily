-- User-facing: history page filters redemptions by user_id, sorted newest first
CREATE INDEX IF NOT EXISTS redemptions_user_created_idx
  ON public.redemptions (user_id, created_at DESC);

-- Admin fulfillment: filters by status, sorted newest first
CREATE INDEX IF NOT EXISTS redemptions_status_created_idx
  ON public.redemptions (status, created_at DESC);

-- Admin fulfillment CSV: joins back to profiles by user_id (covered above) and prize lookups
CREATE INDEX IF NOT EXISTS redemptions_prize_idx
  ON public.redemptions (prize_id);

-- Dashboard "featured prizes" filter: active + in-stock, sorted by point cost
CREATE INDEX IF NOT EXISTS prizes_active_cost_idx
  ON public.prizes (point_cost) WHERE is_active = true AND stock > 0;

-- Zoho webhook lookup by email for processing
CREATE INDEX IF NOT EXISTS zoho_events_email_idx
  ON public.zoho_events (customer_email) WHERE processed = false;

-- Statuses feed: active (non-expired) statuses
CREATE INDEX IF NOT EXISTS statuses_expires_idx
  ON public.statuses (expires_at DESC);