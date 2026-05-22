import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Process a Zoho "contact" webhook payload.
 * Syncs the matching profile (by email) with name + Loyalty/History Points custom fields.
 * Does NOT create new profiles — profiles are FK'd to auth.users, so the user must
 * have signed up already. Unmatched emails are logged and skipped.
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

  if (!email) {
    await supabaseAdmin
      .from("zoho_events")
      .update({ error: "no email on contact" })
      .eq("event_id", eventId);
    return { ok: false, status: "no email", eventId };
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
    return { ok: true, status: "user not found — skipped", email, eventId };
  }

  // Read Loyalty Points / History Points from contact custom fields
  const customFields: any[] = Array.isArray(contact?.custom_fields) ? contact.custom_fields : [];
  const readCF = (...names: string[]): number | null => {
    const lower = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
    for (const cf of customFields) {
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
      const v = contact?.[key];
      if (v !== undefined && v !== null && v !== "") {
        const num = Number(v);
        if (!Number.isNaN(num)) return num;
      }
    }
    return null;
  };

  const loyaltyPoints = readCF("Loyalty Points", "loyalty_points", "LoyaltyPoints");
  const historyPoints = readCF("History Points", "history_points", "HistoryPoints");

  const updates: Record<string, any> = {};
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
    status: `synced (${Object.keys(updates).join(", ") || "no changes"})`,
    email,
    eventId,
  };
}
