
DROP POLICY IF EXISTS "Users insert own redemptions" ON public.redemptions;

CREATE POLICY "Users insert own redemptions"
ON public.redemptions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND points_spent > 0
  AND points_spent <= COALESCE(
    (SELECT points_balance FROM public.profiles WHERE id = auth.uid()),
    0
  )
  AND EXISTS (
    SELECT 1 FROM public.prizes pr
    WHERE pr.id = redemptions.prize_id
      AND pr.is_active = true
      AND pr.stock > 0
      AND pr.point_cost = redemptions.points_spent
  )
);
