CREATE OR REPLACE FUNCTION public.retry_dlq_message(_message_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  _q text;
  _dest text;
  _rec record;
  _found boolean := false;
  _new_payload jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _message_id IS NULL OR length(_message_id) = 0 THEN
    RAISE EXCEPTION 'message_id required';
  END IF;

  FOREACH _q IN ARRAY ARRAY['auth_emails_dlq','transactional_emails_dlq']
  LOOP
    BEGIN
      FOR _rec IN
        EXECUTE format(
          'SELECT msg_id, message FROM pgmq.q_%I WHERE message->>''message_id'' = $1',
          _q
        )
        USING _message_id
      LOOP
        _dest := replace(_q, '_dlq', '');
        -- refresh queued_at so TTL does not immediately re-expire the message
        _new_payload := jsonb_set(_rec.message, '{queued_at}', to_jsonb(now()));
        PERFORM pgmq.send(_dest, _new_payload);
        PERFORM pgmq.delete(_q, _rec.msg_id);
        _found := true;
      END LOOP;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;

  IF _found THEN
    -- clear prior failed/dlq counters so the processor does not immediately re-DLQ
    DELETE FROM public.email_send_log
    WHERE message_id = _message_id AND status IN ('failed','dlq');

    -- wake the queue processor
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
        PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('retried', _found);
END;
$$;

REVOKE ALL ON FUNCTION public.retry_dlq_message(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_dlq_message(text) TO authenticated;