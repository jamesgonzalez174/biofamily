WITH latest AS (
  SELECT DISTINCT ON (payload->'contact'->>'contact_id')
    payload->'contact'->>'contact_id' AS zoho_id,
    payload->'contact' AS contact
  FROM public.zoho_events
  WHERE payload ? 'contact'
  ORDER BY payload->'contact'->>'contact_id', created_at DESC
),
points AS (
  SELECT
    l.zoho_id,
    COALESCE(
      NULLIF(l.contact->>'cf_loyalty_points','')::int,
      (SELECT NULLIF(cf->>'value','')::int FROM jsonb_array_elements(l.contact->'custom_fields') cf
        WHERE cf->>'api_name' = 'cf_loyalty_points' LIMIT 1),
      0
    ) AS loyalty,
    COALESCE(
      NULLIF(l.contact->>'cf_history_points','')::int,
      (SELECT NULLIF(cf->>'value','')::int FROM jsonb_array_elements(l.contact->'custom_fields') cf
        WHERE cf->>'api_name' = 'cf_history_points' LIMIT 1),
      0
    ) AS history
  FROM latest l
)
UPDATE public.pharmacies p
SET loyalty_points = pts.loyalty,
    history_points = pts.history,
    updated_at = now()
FROM points pts
WHERE p.zoho_contact_id = pts.zoho_id;