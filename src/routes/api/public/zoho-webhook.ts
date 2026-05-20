import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Zoho Books webhook.
 *
 * Accepts payloads from "Invoice → Sent/Created" or "Payment → Received".
 * Extracts:
 *   - customer email (invoice.email / contact.email / customer_email)
 *   - line items (sku, quantity, total)
 *   - invoice total
 *
 * Awards points by:
 *   1. SKU mapping (sku_points.points_per_unit * quantity), if any line item matches
 *   2. else, if invoice-total fallback enabled, awards floor(total * points_per_dollar)
 *
 * Optional shared secret via header "x-zoho-webhook-secret" matching env ZOHO_WEBHOOK_SECRET.
 */
export const Route = createFileRoute("/api/public/zoho-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.ZOHO_WEBHOOK_SECRET;
        if (secret && request.headers.get("x-zoho-webhook-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: any;
        try { payload = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

        const invoice = payload?.invoice ?? payload?.payment ?? payload;
        const eventId = String(invoice?.invoice_id ?? invoice?.payment_id ?? payload?.event_id ?? crypto.randomUUID());
        const email = (invoice?.email ?? invoice?.customer_email ?? invoice?.contact?.email ?? "").toString().toLowerCase().trim();
        const lineItems: any[] = invoice?.line_items ?? invoice?.invoice_items ?? [];
        const total = Number(invoice?.total ?? invoice?.amount ?? 0);

        // Log the event
        const { error: logErr } = await supabaseAdmin.from("zoho_events").insert({
          event_id: eventId,
          event_type: payload?.event_type ?? "invoice",
          customer_email: email || null,
          payload,
        });
        if (logErr && !logErr.message.includes("duplicate")) console.error("zoho log error", logErr);

        // Dedupe by event_id
        const { data: existing } = await supabaseAdmin.from("zoho_events").select("processed").eq("event_id", eventId).maybeSingle();
        if (existing?.processed) return new Response(JSON.stringify({ ok: true, skipped: "already processed" }), { status: 200 });

        if (!email) {
          await supabaseAdmin.from("zoho_events").update({ error: "no email" }).eq("event_id", eventId);
          return new Response(JSON.stringify({ ok: false, error: "No customer email" }), { status: 200 });
        }

        // Find user by email
        const { data: profile } = await supabaseAdmin.from("profiles").select("id, points_balance, lifetime_points, pharmacy_id").ilike("email", email).maybeSingle();
        if (!profile) {
          await supabaseAdmin.from("zoho_events").update({ error: "user not found" }).eq("event_id", eventId);
          return new Response(JSON.stringify({ ok: false, error: "User not found" }), { status: 200 });
        }

        // Compute points
        let pointsAwarded = 0;
        const breakdown: string[] = [];

        // Read Zoho customer custom fields: "Loyalty Points" (to award/divide) and "History Points" (lifetime total).
        const contact = invoice?.contact ?? invoice?.customer ?? invoice ?? {};
        const customerCustomFields: any[] = [
          ...(Array.isArray(contact?.custom_fields) ? contact.custom_fields : []),
          ...(Array.isArray(invoice?.custom_fields) ? invoice.custom_fields : []),
        ];
        const readCF = (...names: string[]): number | null => {
          const lower = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
          for (const cf of customerCustomFields) {
            const label = String(cf?.label ?? cf?.api_name ?? cf?.placeholder ?? "").toLowerCase().replace(/[\s_-]/g, "");
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
            const { data: mappings } = await supabaseAdmin.from("sku_points").select("*").in("sku", skus).eq("is_active", true);
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
          // Find all profiles in same pharmacy (including buyer). If buyer has no pharmacy, only buyer gets points.
          let recipients: { id: string; points_balance: number; lifetime_points: number }[] = [];
          if (profile.pharmacy_id) {
            const { data: members } = await supabaseAdmin
              .from("profiles")
              .select("id, points_balance, lifetime_points")
              .eq("pharmacy_id", profile.pharmacy_id);
            recipients = members ?? [];
          }
          if (recipients.length === 0) {
            recipients = [{ id: profile.id, points_balance: profile.points_balance, lifetime_points: profile.lifetime_points }];
          }

          const share = Math.floor(pointsAwarded / recipients.length);
          if (share > 0) {
            const splitNote = recipients.length > 1 ? ` — split across ${recipients.length} pharmacy members` : "";
            for (const r of recipients) {
              await supabaseAdmin.from("profiles").update({
                points_balance: r.points_balance + share,
                lifetime_points: historyPoints !== null ? Math.floor(historyPoints) : r.lifetime_points + share,
              }).eq("id", r.id);
              await supabaseAdmin.from("points_ledger").insert({
                user_id: r.id, delta: share,
                reason: `Zoho purchase (${breakdown.join(", ")})${splitNote}`,
                source: "zoho", reference: eventId,
              });
            }
          }
        }

        await supabaseAdmin.from("zoho_events").update({ processed: true, points_awarded: pointsAwarded }).eq("event_id", eventId);

        return new Response(JSON.stringify({ ok: true, pointsAwarded }), { status: 200, headers: { "Content-Type": "application/json" } });
      },

      GET: async () => new Response("Zoho webhook ready", { status: 200 }),
    },
  },
});
