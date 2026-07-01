import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmailServer } from "@/lib/email/send.server";
import { fetchZohoContact } from "@/lib/zoho-api.server";
import { processZohoContact } from "@/lib/zoho-contact.server";

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


  // Extract contact details from the invoice/contact payload so we can keep
  // the profile in sync (or create a new one if missing).
  const contactForProfile = invoice?.contact ?? invoice?.customer ?? {};
  const invoiceFullName =
    (contactForProfile?.contact_name ??
      contactForProfile?.display_name ??
      contactForProfile?.first_name ??
      invoice?.customer_name ??
      invoice?.contact_name ??
      "")
      .toString()
      .trim() || null;
  const invoicePhone =
    (contactForProfile?.phone ??
      contactForProfile?.mobile ??
      invoice?.phone ??
      "")
      .toString()
      .trim() || null;

  let { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, points_balance, lifetime_points, pharmacy_id, full_name, phone")
    .ilike("email", email)
    .maybeSingle();

  if (profile) {
    // Update changed contact fields only (don't clobber existing values with blanks)
    const patch: { full_name?: string; phone?: string } = {};
    if (invoiceFullName && invoiceFullName !== profile.full_name) patch.full_name = invoiceFullName;
    if (invoicePhone && invoicePhone !== profile.phone) patch.phone = invoicePhone;
    if (Object.keys(patch).length > 0) {
      await supabaseAdmin.from("profiles").update(patch).eq("id", profile.id);
    }
  } else {
    // Create a placeholder profile so points are tracked even before the user signs up.
    // No auth.users row is created — the user will link on first sign-up via email match.
    const newId = crypto.randomUUID();
    const { data: created, error: createErr } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: newId,
        email,
        full_name: invoiceFullName,
        phone: invoicePhone,
      })
      .select("id, points_balance, lifetime_points, pharmacy_id, full_name, phone")
      .single();
    if (createErr || !created) {
      await supabaseAdmin.from("zoho_events").update({ error: `failed to create profile: ${createErr?.message ?? "unknown"}` }).eq("event_id", eventId);
      return { ok: false, status: "profile create failed", pointsAwarded: 0, email, eventId };
    }
    profile = created;
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

    // Split evenly, distributing the remainder so no points are lost.
    const n = recipients.length;
    const base = Math.floor(pointsAwarded / n);
    const remainder = pointsAwarded - base * n;
    const splitNote = n > 1 ? ` — split across ${n} pharmacy members` : "";
    for (let i = 0; i < n; i++) {
      const r = recipients[i];
      const share = base + (i < remainder ? 1 : 0);
      if (share <= 0) continue;

      // Only the invoice owner's lifetime_points may sync from Zoho's
      // History Points — and never *decrease* it (lifetime is monotonic).
      const isOwner = r.id === profile.id;
      const newBalance = r.points_balance + share;
      const nextLifetime =
        isOwner && historyPoints !== null
          ? Math.max(r.lifetime_points, Math.floor(historyPoints))
          : r.lifetime_points + share;
      await supabaseAdmin
        .from("profiles")
        .update({ points_balance: newBalance, lifetime_points: nextLifetime })
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

      // Notify the recipient by email (fire-and-forget; failures shouldn't block points)
      const { data: recipientProfile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", r.id)
        .maybeSingle();
      if (recipientProfile?.email) {
        try {
          await sendTransactionalEmailServer({
            templateName: "points-earned",
            recipientEmail: recipientProfile.email,
            idempotencyKey: `points-zoho-${eventId}-${r.id}`,
            templateData: {
              name: recipientProfile.full_name ?? undefined,
              points: share,
              reason: `Zoho purchase${splitNote}`,
              newBalance,
            },
          });
        } catch (e) {
          console.error("Failed to send points-earned email", e);
        }
      }
    }

  }


  // Best-effort: pull the full contact from Zoho so zoho_customers, pharmacies,
  // and the matching profile stay fresh — even if the contact wasn't edited in
  // Zoho. Failures are logged but never block invoice processing.
  const contactIdForRefresh = String(
    invoice?.customer_id ?? invoice?.contact_id ?? invoice?.contact?.contact_id ?? "",
  ).trim();
  if (contactIdForRefresh) {
    try {
      const freshContact = await fetchZohoContact(contactIdForRefresh);
      if (freshContact) {
        await processZohoContact({ contact: freshContact }, `invoice-${eventId}-contact-refresh`);
      }
    } catch (e) {
      console.warn("Contact refresh from Zoho failed (non-fatal):", e);
    }
  }

  await supabaseAdmin
    .from("zoho_events")
    .update({ processed: true, points_awarded: pointsAwarded, error: null })
    .eq("event_id", eventId);

  return { ok: true, status: "processed", pointsAwarded, email, eventId };
}
