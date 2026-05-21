import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Process a single Zoho webhook payload: award points + mark the event row processed.
 * Idempotent — if the event is already processed, returns early.
 * Returns a short status string + points awarded (or 0 / -1 on skip/error).
 */
export async function processZohoPayload(
  payload: any,
  eventIdOverride?: string,
): Promise<{
  ok: boolean;
  status: string;
  pointsAwarded: number;
  email?: string;
  eventId: string;
}> {
  const invoice = payload?.invoice ?? payload?.payment ?? payload;
  const eventId = String(
    eventIdOverride ??
      invoice?.invoice_id ??
      invoice?.payment_id ??
      payload?.event_id ??
      crypto.randomUUID(),
  );
  const email = (invoice?.email ?? invoice?.customer_email ?? invoice?.contact?.email ?? "")
    .toString()
    .toLowerCase()
    .trim();
  const lineItems: any[] = invoice?.line_items ?? invoice?.invoice_items ?? [];
  const total = Number(invoice?.total ?? invoice?.amount ?? 0);

  // Idempotency guard — never double-credit on retries / reprocess
  const { data: existingEvent } = await supabaseAdmin
    .from("zoho_events")
    .select("processed, points_awarded")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existingEvent?.processed) {
    return {
      ok: true,
      status: "already processed",
      pointsAwarded: existingEvent.points_awarded ?? 0,
      email,
      eventId,
    };
  }

  if (!email) {
    await supabaseAdmin.from("zoho_events").update({ error: "no email" }).eq("event_id", eventId);
    return { ok: false, status: "no email", pointsAwarded: 0, eventId };
  }


  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, points_balance, lifetime_points, pharmacy_id")
    .ilike("email", email)
    .maybeSingle();

  if (!profile) {
    await supabaseAdmin.from("zoho_events").update({ error: "user not found" }).eq("event_id", eventId);
    return { ok: false, status: "user not found", pointsAwarded: 0, email, eventId };
  }

  let pointsAwarded = 0;
  const breakdown: string[] = [];

  const contact = invoice?.contact ?? invoice?.customer ?? invoice ?? {};
  const customerCustomFields: any[] = [
    ...(Array.isArray(contact?.custom_fields) ? contact.custom_fields : []),
    ...(Array.isArray(invoice?.custom_fields) ? invoice.custom_fields : []),
  ];
  const readCF = (...names: string[]): number | null => {
    const lower = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
    for (const cf of customerCustomFields) {
      const label = String(cf?.label ?? cf?.api_name ?? cf?.placeholder ?? "")
        .toLowerCase()
        .replace(/[\s_-]/g, "");
      if (lower.includes(label)) {
        const v = Number(cf?.value ?? cf?.value_formatted ?? 0);
        if (!Number.isNaN(v)) return v;
      }
    }
    for (const n of names) {
      const key = `cf_${n.toLowerCase().replace(/\s+/g, "_")}`;
      const v = contact?.[key] ?? invoice?.[key];
      if (v !== undefined && v !== null && v !== "") {
        const num = Number(v);
        if (!Number.isNaN(num)) return num;
      }
    }
    return null;
  };

  const loyaltyPoints = readCF("Loyalty Points", "loyalty_points", "LoyaltyPoints");
  const historyPoints = readCF("History Points", "history_points", "HistoryPoints");

  if (loyaltyPoints !== null && loyaltyPoints > 0) {
    pointsAwarded = Math.floor(loyaltyPoints);
    breakdown.push(`Loyalty Points = ${pointsAwarded}`);
  } else if (lineItems.length > 0) {
    const skus = lineItems.map((li) => String(li.sku ?? li.item_sku ?? "")).filter(Boolean);
    if (skus.length > 0) {
      const { data: mappings } = await supabaseAdmin
        .from("sku_points")
        .select("*")
        .in("sku", skus)
        .eq("is_active", true);
      const map = new Map((mappings ?? []).map((m) => [m.sku, m]));
      for (const li of lineItems) {
        const sku = String(li.sku ?? li.item_sku ?? "");
        const qty = Number(li.quantity ?? 1);
        const m = map.get(sku);
        if (m) {
          const p = m.points_per_unit * qty;
          pointsAwarded += p;
          breakdown.push(`${sku} x${qty} = ${p}`);
        }
      }
    }
  }

  if (pointsAwarded === 0 && loyaltyPoints === null) {
    const { data: settings } = await supabaseAdmin.from("settings").select("*").eq("id", 1).single();
    if (settings?.enable_invoice_total_fallback && total > 0) {
      pointsAwarded = Math.floor(total * Number(settings.points_per_dollar));
      breakdown.push(`$${total} x ${settings.points_per_dollar} = ${pointsAwarded}`);
    }
  }

  if (pointsAwarded > 0) {
    let recipients: { id: string; points_balance: number; lifetime_points: number }[] = [];
    if (profile.pharmacy_id) {
      const { data: members } = await supabaseAdmin
        .from("profiles")
        .select("id, points_balance, lifetime_points")
        .eq("pharmacy_id", profile.pharmacy_id);
      recipients = members ?? [];
    }
    if (recipients.length === 0) {
      recipients = [
        { id: profile.id, points_balance: profile.points_balance, lifetime_points: profile.lifetime_points },
      ];
    }

    const share = Math.floor(pointsAwarded / recipients.length);
    if (share > 0) {
      const splitNote = recipients.length > 1 ? ` — split across ${recipients.length} pharmacy members` : "";
      for (const r of recipients) {
        // Only the invoice owner's lifetime_points should be synced from Zoho's
        // History Points; other pharmacy members keep their own lifetime total.
        const isOwner = r.id === profile.id;
        await supabaseAdmin
          .from("profiles")
          .update({
            points_balance: r.points_balance + share,
            lifetime_points:
              isOwner && historyPoints !== null
                ? Math.floor(historyPoints)
                : r.lifetime_points + share,
          })
          .eq("id", r.id);

        // Skip if a ledger row already exists (unique index also enforces this).
        const { data: existingLedger } = await supabaseAdmin
          .from("points_ledger")
          .select("id")
          .eq("source", "zoho")
          .eq("reference", eventId)
          .eq("user_id", r.id)
          .maybeSingle();
        if (existingLedger) continue;

        await supabaseAdmin.from("points_ledger").insert({
          user_id: r.id,
          delta: share,
          reason: `Zoho purchase (${breakdown.join(", ")})${splitNote}`,
          source: "zoho",
          reference: eventId,
        });
      }
    }
  }


  await supabaseAdmin
    .from("zoho_events")
    .update({ processed: true, points_awarded: pointsAwarded, error: null })
    .eq("event_id", eventId);

  return { ok: true, status: "processed", pointsAwarded, email, eventId };
}
