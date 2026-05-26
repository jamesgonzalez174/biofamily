ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users subscribe to own points ledger channel" ON realtime.messages;
CREATE POLICY "Users subscribe to own points ledger channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'points-ledger-' || auth.uid()::text
  OR public.has_role(auth.uid(), 'admin'::app_role)
);