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
  opts: { skipPointsSync?: boolean } = {},
): Promise<{ ok: boolean; status: string; email?: string; eventId: string }> {

  const contact = payload?.contact ?? payload?.customer ?? payload;

  // Skip inactive/disabled Zoho contacts entirely — don't upsert pharmacies,
  // don't distribute points. Matches the daily-sync filter.
  const statusStr = String(contact?.status ?? "").toLowerCase();
  const isInactive =
    statusStr === "inactive" ||
    statusStr === "disabled" ||
    statusStr === "crm_inactive" ||
    contact?.is_active === false;
  if (isInactive) {
    await supabaseAdmin
      .from("zoho_events")
      .update({ processed: true, error: "contact inactive — skipped" })
      .eq("event_id", eventId);
    return { ok: true, status: "skipped inactive contact", eventId };
  }

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

  // Read "Reference Invoiced" custom field (single value or comma/newline separated list of invoice numbers)
  const readCFText = (...names: string[]): string | null => {
    const wanted = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, "").replace(/^cf/, ""));
    for (const cf of customFields) {
      const candidates = [cf?.label, cf?.api_name, cf?.placeholder]
        .map((x) => String(x ?? "").toLowerCase().replace(/[\s_-]/g, "").replace(/^cf/, ""));
      if (candidates.some((c) => c && wanted.includes(c))) {
        const v = cf?.value ?? cf?.value_formatted ?? "";
        const s = String(v).trim();
        return s || null;
      }
    }
    for (const n of names) {
      const key = n.toLowerCase().startsWith("cf_") ? n.toLowerCase() : `cf_${n.toLowerCase().replace(/\s+/g, "_")}`;
      const v = contact?.[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return null;
  };
  const parseInvoiceRefs = (raw: string | null): string[] => {
    if (!raw) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of raw.split(/[\s,;\n\r|]+/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const key = trimmed.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
    return out;
  };

  const invoiceRefs = parseInvoiceRefs(
    readCFText("Reference Invoiced", "reference_invoiced", "cf_reference_invoiced", "Invoice References", "invoice_references"),
  );

  // 1a) Upsert zoho_customers row so the customer list mirrors Zoho contacts.
  if (zohoContactId) {
    const companyName =
      (contact?.company_name ?? contact?.contact_name ?? "").toString().trim() || null;
    const { data: existingCustomer } = await supabaseAdmin
      .from("zoho_customers")
      .select("id")
      .eq("zoho_contact_id", zohoContactId)
      .maybeSingle();
    const customerRow = {
      zoho_contact_id: zohoContactId,
      email: email || null,
      full_name: fullName || null,
      company_name: companyName,
      loyalty_points: lp,
      history_points: hp,
      raw: contact,
      last_synced_at: new Date().toISOString(),
    };
    if (existingCustomer) {
      await supabaseAdmin.from("zoho_customers").update(customerRow).eq("id", existingCustomer.id);
    } else {
      await supabaseAdmin.from("zoho_customers").insert(customerRow);
    }
  }

  // 1) Upsert pharmacy by zoho_contact_id.
  // Point delta = change in Zoho's Loyalty Points field since last sync.
  // History Points on the pharmacy row is the cumulative sum of deltas.
  const hasLoyalty = lp !== null;
  const currentLoyalty = hasLoyalty ? Math.max(0, Math.floor(lp!)) : 0;
  void hp;


  let pharmacyAction: "none" | "created" | "updated" = "none";
  let pharmacyId: string | null = null;
  let loyaltyDelta = 0;
  if (zohoContactId && fullName) {
    const { data: existingPharm } = await supabaseAdmin
      .from("pharmacies")
      .select("id, name, address, loyalty_points, history_points")
      .eq("zoho_contact_id", zohoContactId)
      .maybeSingle();

    if (existingPharm) {
      pharmacyId = (existingPharm as any).id as string;
      const oldLoyalty = Number((existingPharm as any).loyalty_points ?? 0);
      const oldHistory = Number((existingPharm as any).history_points ?? 0);
      if (hasLoyalty) {
        loyaltyDelta = Math.max(0, currentLoyalty - oldLoyalty);
      }
      const nextHistory = oldHistory + loyaltyDelta;

      const pharmUpdates: {
        name?: string;
        address?: string | null;
        loyalty_points?: number;
        history_points?: number;
        invoice_references?: string[];
      } = {};
      if (existingPharm.name !== fullName) pharmUpdates.name = fullName;
      if (address && existingPharm.address !== address) pharmUpdates.address = address;
      if (hasLoyalty && oldLoyalty !== currentLoyalty) {
        pharmUpdates.loyalty_points = currentLoyalty;
      }
      if (nextHistory !== oldHistory) {
        pharmUpdates.history_points = nextHistory;
      }
      // Cross-pharmacy dedup: strip these refs from any other pharmacy first,
      // then assign to this one — an invoice number can't belong to two pharmacies.
      if (invoiceRefs.length > 0) {
        const { data: otherPharms } = await supabaseAdmin
          .from("pharmacies")
          .select("id, invoice_references")
          .overlaps("invoice_references", invoiceRefs)
          .neq("zoho_contact_id", zohoContactId);
        const incomingUpper = new Set(invoiceRefs.map((r) => r.toUpperCase()));
        for (const op of otherPharms ?? []) {
          const current: string[] = Array.isArray((op as any).invoice_references)
            ? ((op as any).invoice_references as string[])
            : [];
          const filtered = current.filter((r) => !incomingUpper.has(r.toUpperCase()));
          if (filtered.length !== current.length) {
            await supabaseAdmin
              .from("pharmacies")
              .update({ invoice_references: filtered })
              .eq("id", (op as any).id);
          }
        }
        pharmUpdates.invoice_references = invoiceRefs;
      }
      if (Object.keys(pharmUpdates).length > 0) {
        await supabaseAdmin.from("pharmacies").update(pharmUpdates).eq("id", existingPharm.id);
        pharmacyAction = "updated";
      }

    } else {
      // New pharmacy: strip incoming refs from any existing pharmacy that has them.
      if (invoiceRefs.length > 0) {
        const { data: otherPharms } = await supabaseAdmin
          .from("pharmacies")
          .select("id, invoice_references")
          .overlaps("invoice_references", invoiceRefs);
        const incomingUpper = new Set(invoiceRefs.map((r) => r.toUpperCase()));
        for (const op of otherPharms ?? []) {
          const current: string[] = Array.isArray((op as any).invoice_references)
            ? ((op as any).invoice_references as string[])
            : [];
          const filtered = current.filter((r) => !incomingUpper.has(r.toUpperCase()));
          if (filtered.length !== current.length) {
            await supabaseAdmin
              .from("pharmacies")
              .update({ invoice_references: filtered })
              .eq("id", (op as any).id);
          }
        }
      }
      // First observation: credit the current Loyalty Points as today's delta.
      loyaltyDelta = currentLoyalty;
      const { data: created } = await supabaseAdmin
        .from("pharmacies")
        .insert({
          name: fullName,
          address,
          zoho_contact_id: zohoContactId,
          is_active: true,
          loyalty_points: currentLoyalty,
          history_points: currentLoyalty,
          invoice_references: invoiceRefs,
        })
        .select("id")
        .single();
      pharmacyId = (created as any)?.id ?? null;
      pharmacyAction = "created";
    }
  }


  // 2) Split the loyalty delta (today's newly earned points) equally across
  //    all members of this pharmacy, adding to each member's balance + lifetime.
  let splitNote = "";
  if (pharmacyId && !opts.skipPointsSync && loyaltyDelta > 0) {
    const { data: members } = await supabaseAdmin
      .from("profiles")
      .select("id, points_balance, lifetime_points")
      .eq("pharmacy_id", pharmacyId);

    if (members && members.length > 0) {
      const n = members.length;
      const share = Math.floor(loyaltyDelta / n);
      if (share > 0) {
        for (const m of members as any[]) {
          const newBal = Math.max(0, Number(m.points_balance ?? 0) + share);
          const newHist = Number(m.lifetime_points ?? 0) + share;
          await supabaseAdmin
            .from("profiles")
            .update({ points_balance: newBal, lifetime_points: newHist })
            .eq("id", m.id);
          await supabaseAdmin.from("points_ledger").insert({
            user_id: m.id,
            delta: share,
            reason: n > 1 ? `Zoho sync — split across ${n} pharmacy members` : "Zoho sync",
            source: "zoho_sync",
            reference: pharmacyId,
          });
        }
        splitNote = `; split ${share}×${n} to members`;
      }
    }
  }


  // 3) Keep the matched profile's name in sync — but never overwrite points here;
  //    points are credited via the pharmacy-member split above.
  if (!email) {
    await supabaseAdmin
      .from("zoho_events")
      .update({ processed: true, error: pharmacyAction === "none" ? "no email, no pharmacy" : null })
      .eq("event_id", eventId);
    return { ok: true, status: `pharmacy ${pharmacyAction}${splitNote}, no email`, eventId };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .ilike("email", email)
    .maybeSingle();

  if (profile && fullName && fullName !== profile.full_name) {
    await supabaseAdmin.from("profiles").update({ full_name: fullName }).eq("id", profile.id);
  }

  await supabaseAdmin
    .from("zoho_events")
    .update({ processed: true, error: profile ? null : "user not found" })
    .eq("event_id", eventId);

  return {
    ok: true,
    status: `pharmacy ${pharmacyAction}${splitNote}${profile ? "" : "; profile not found"}`,
    email,
    eventId,
  };
}
