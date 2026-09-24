CREATE OR REPLACE FUNCTION public.trg_block_cancel_claimed()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status = 'claimed' THEN
    RAISE EXCEPTION 'Cannot cancel a claimed redemption';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS redemptions_block_cancel_claimed ON public.redemptions;
CREATE TRIGGER redemptions_block_cancel_claimed
  BEFORE UPDATE OF status ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_cancel_claimed();