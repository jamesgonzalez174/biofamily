import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processZohoPayload } from "@/lib/zoho-process.server";

/**
 * Zoho Books webhook.
 * Stores the event then runs the shared processor (see zoho-process.server.ts).
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

        const invoice = payload?.invoice ?? payload?.payment ?? payload;
        const eventId = String(
          invoice?.invoice_id ?? invoice?.payment_id ?? payload?.event_id ?? crypto.randomUUID(),
        );
        const email = (invoice?.email ?? invoice?.customer_email ?? invoice?.contact?.email ?? "")
          .toString()
          .toLowerCase()
          .trim();

        // Log the event (idempotent on event_id)
        const { error: logErr } = await supabaseAdmin.from("zoho_events").insert({
          event_id: eventId,
          event_type: payload?.event_type ?? "invoice",
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

        const result = await processZohoPayload(payload);

        return new Response(
          JSON.stringify({ ok: result.ok, status: result.status, pointsAwarded: result.pointsAwarded }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },

      GET: async () => new Response("Zoho webhook ready", { status: 200 }),
    },
  },
});
