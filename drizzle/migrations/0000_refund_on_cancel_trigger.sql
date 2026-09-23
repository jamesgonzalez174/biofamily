-- Safety net: whenever a redemption's status becomes 'cancelled' — from any code
-- path, including direct updates — refund the points, restore stock, and record
-- the refund in the points ledger exactly once.
-- The cancel_redemption() RPC inserts its ledger row BEFORE setting the status,
-- so this trigger sees the existing entry and skips — no double refund.
CREATE OR REPLACE FUNCTION public.trg_refund_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.points_ledger
      WHERE source = 'redemption_cancel' AND reference = NEW.id::text
    ) THEN
      UPDATE public.profiles
        SET points_balance = points_balance + NEW.points_spent
        WHERE id = NEW.user_id;

      UPDATE public.prizes SET stock = stock + 1 WHERE id = NEW.prize_id;

      INSERT INTO public.points_ledger (user_id, delta, reason, source, reference)
      VALUES (NEW.user_id, NEW.points_spent, 'Cancelled: ' || NEW.prize_name, 'redemption_cancel', NEW.id::text)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS redemptions_refund_on_cancel ON public.redemptions;
CREATE TRIGGER redemptions_refund_on_cancel
  AFTER UPDATE OF status ON public.redemptions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refund_on_cancel();