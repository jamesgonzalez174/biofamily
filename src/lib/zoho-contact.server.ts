import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Process a Zoho "contact" webhook payload.
 * 1. Upserts a pharmacy row keyed by zoho_contact_id (so the pharmacies list
 *    auto-populates from Zoho contacts — name + address).
 * 2. If a profile exists for the contact email, syncs name + Loyalty/History Points.
 *    Unmatched emails are logged but the pharmacy upsert still runs.
 */
export async function processZohoContact(
  payload: any,
  eventId: string,
): Promise<{ ok: boolean; status: string; email?: string; eventId: string }> {
  const contact = payload?.contact ?? payload?.customer ?? payload;
  const email = (
    contact?.email ??
    contact?.contact_email ??
    contact?.primary_contact?.email ??
    contact?.contact_persons?.[0]?.email ??
    ""
  )
    .toString()
    .toLowerCase()
    .trim();
  const fullName = (contact?.contact_name ?? contact?.display_name ?? contact?.company_name ?? "")
    .toString()
    .trim();

  const zohoContactId = String(
    contact?.contact_id ?? contact?.customer_id ?? contact?.id ?? "",
  ).trim();

  // Build address string from billing/shipping if present
  const addr =
    contact?.billing_address ?? contact?.shipping_address ?? contact?.address ?? null;
  const addressParts: string[] = [];
  if (addr && typeof addr === "object") {
    for (const k of ["address", "street", "street2", "city", "state", "zip", "country"]) {
      const v = (addr as any)[k];
      if (v) addressParts.push(String(v));
    }
  }
  const address = addressParts.join(", ").trim() || null;

  // Read Loyalty Points / History Points from contact custom fields.
  // Zoho api_name: cf_loyalty_points -> loyalty, cf_history_points -> history.
  const customFields: any[] = Array.isArray(contact?.custom_fields) ? contact.custom_fields : [];
  const readCF = (...names: string[]): number | null => {
    const wanted = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, "").replace(/^cf/, ""));
    for (const cf of customFields) {
      const candidates = [cf?.label, cf?.api_name, cf?.placeholder]
        .map((x) => String(x ?? "").toLowerCase().replace(/[\s_-]/g, "").replace(/^cf/, ""));
      if (candidates.some((c) => c && wanted.includes(c))) {
        const v = Number(cf?.value ?? cf?.value_formatted ?? 0);
        if (!Number.isNaN(v)) return v;
      }
    }
    for (const n of names) {
      const key = n.toLowerCase().startsWith("cf_")
        ? n.toLowerCase()
        : `cf_${n.toLowerCase().replace(/\s+/g, "_")}`;
      const v = contact?.[key];
      if (v !== undefined && v !== null && v !== "") {
        const num = Number(v);
        if (!Number.isNaN(num)) return num;
      }
    }
    return null;
  };

  const loyaltyPoints = readCF("Loyalty Points", "loyalty_points", "cf_loyalty_points");
  const historyPoints = readCF("History Points", "history_points", "cf_history_points");
  const lp = loyaltyPoints !== null ? Math.floor(loyaltyPoints) : null;
  const hp = historyPoints !== null ? Math.floor(historyPoints) : null;

  // 1) Upsert pharmacy by zoho_contact_id — store loyalty/history directly on it.
  let pharmacyAction: "none" | "created" | "updated" = "none";
  if (zohoContactId && fullName) {
    const { data: existingPharm } = await supabaseAdmin
      .from("pharmacies")
      .select("id, name, address, loyalty_points, history_points")
      .eq("zoho_contact_id", zohoContactId)
      .maybeSingle();

    if (existingPharm) {
      const pharmUpdates: { name?: string; address?: string | null; loyalty_points?: number; history_points?: number } = {};
      if (existingPharm.name !== fullName) pharmUpdates.name = fullName;
      if (address && existingPharm.address !== address) pharmUpdates.address = address;
      if (lp !== null && (existingPharm as any).loyalty_points !== lp) pharmUpdates.loyalty_points = lp;
      if (hp !== null && (existingPharm as any).history_points !== hp) pharmUpdates.history_points = hp;
      if (Object.keys(pharmUpdates).length > 0) {
        await supabaseAdmin.from("pharmacies").update(pharmUpdates).eq("id", existingPharm.id);
        pharmacyAction = "updated";
      }
    } else {
      await supabaseAdmin.from("pharmacies").insert({
        name: fullName,
        address,
        zoho_contact_id: zohoContactId,
        is_active: true,
        loyalty_points: lp ?? 0,
        history_points: hp ?? 0,
      });
      pharmacyAction = "created";
    }
  }

  // 2) Sync matching profile by email (if any)
  if (!email) {
    await supabaseAdmin
      .from("zoho_events")
      .update({ processed: true, error: pharmacyAction === "none" ? "no email, no pharmacy" : null })
      .eq("event_id", eventId);
    return { ok: true, status: `pharmacy ${pharmacyAction}, no email`, eventId };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, points_balance, lifetime_points, full_name")
    .ilike("email", email)
    .maybeSingle();

  if (!profile) {
    await supabaseAdmin
      .from("zoho_events")
      .update({ error: "user not found", processed: true })
      .eq("event_id", eventId);
    return {
      ok: true,
      status: `pharmacy ${pharmacyAction}, profile not found`,
      email,
      eventId,
    };
  }

  const updates: {
    full_name?: string;
    points_balance?: number;
    lifetime_points?: number;
  } = {};
  if (fullName && fullName !== profile.full_name) updates.full_name = fullName;
  if (loyaltyPoints !== null) updates.points_balance = Math.floor(loyaltyPoints);
  if (historyPoints !== null) updates.lifetime_points = Math.floor(historyPoints);

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from("profiles").update(updates).eq("id", profile.id);
  }


  await supabaseAdmin
    .from("zoho_events")
    .update({ processed: true, error: null })
    .eq("event_id", eventId);

  return {
    ok: true,
    status: `pharmacy ${pharmacyAction}; profile ${Object.keys(updates).join(", ") || "no changes"}`,
    email,
    eventId,
  };
}
