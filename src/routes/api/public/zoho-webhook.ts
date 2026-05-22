import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processZohoPayload } from "@/lib/zoho-process.server";
import { processZohoContact } from "@/lib/zoho-contact.server";

/**
 * Zoho Books webhook.
 * Handles invoice/payment events (awards points) and contact events
 * (syncs name + Loyalty/History Points to matching profile).
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
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Detect event type — contact, invoice, or payment
        const rawType = String(payload?.event_type ?? "").toLowerCase();
        const isContact =
          rawType.includes("contact") || (!!payload?.contact && !payload?.invoice && !payload?.payment);
        const isPayment = rawType.includes("payment") || !!payload?.payment;
        const kind = isContact ? "contact" : isPayment ? "payment" : "invoice";

        const contact = payload?.contact ?? payload?.customer;
        const invoice = payload?.invoice ?? payload?.payment ?? payload;
        const eventId = String(
          (isContact
            ? contact?.contact_id ?? contact?.customer_id
            : invoice?.invoice_id ?? invoice?.payment_id) ??
            payload?.event_id ??
            crypto.randomUUID(),
        );
        const email = (
          (isContact
            ? contact?.email ?? contact?.contact_email ?? contact?.primary_contact?.email
            : invoice?.email ?? invoice?.customer_email ?? invoice?.contact?.email) ?? ""
        )
          .toString()
          .toLowerCase()
          .trim();

        // Log the event (idempotent on event_id)
        const { error: logErr } = await supabaseAdmin.from("zoho_events").insert({
          event_id: eventId,
          event_type: payload?.event_type ?? kind,
          customer_email: email || null,
          payload,
        });
        if (logErr && !logErr.message.includes("duplicate")) {
          console.error("zoho log error", logErr);
        }

        // Dedupe
        const { data: existing } = await supabaseAdmin
          .from("zoho_events")
          .select("processed")
          .eq("event_id", eventId)
          .maybeSingle();
        if (existing?.processed) {
          return new Response(JSON.stringify({ ok: true, skipped: "already processed" }), { status: 200 });
        }

        if (isContact) {
          const result = await processZohoContact(payload, eventId);
          return new Response(
            JSON.stringify({ ok: result.ok, status: result.status, kind: "contact" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        const result = await processZohoPayload(payload, eventId);
        return new Response(
          JSON.stringify({
            ok: result.ok,
            status: result.status,
            pointsAwarded: result.pointsAwarded,
            kind,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },

      GET: async () => new Response("Zoho webhook ready", { status: 200 }),
    },
  },
});

