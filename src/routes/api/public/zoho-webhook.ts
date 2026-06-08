import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processZohoContact } from "@/lib/zoho-contact.server";

/**
 * Zoho Books / CRM webhook — Contacts only.
 * Open endpoint (no auth). Syncs Zoho contact -> pharmacies + zoho_customers,
 * and mirrors Loyalty/History Points onto a matching profile (by email).
 */
export const Route = createFileRoute("/api/public/zoho-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require a shared secret on every inbound Zoho webhook. Without this,
        // anyone can POST arbitrary points balances for any user.
        const provided =
          request.headers.get("x-zoho-webhook-token") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
          "";
        const expected = process.env.ZOHO_WEBHOOK_SECRET;
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const contact = payload?.contact ?? payload?.customer ?? payload;
        const eventId = String(
          contact?.contact_id ??
            contact?.customer_id ??
            contact?.id ??
            payload?.event_id ??
            crypto.randomUUID(),
        );
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

        // Log the event (idempotent on event_id)
        const { error: logErr } = await supabaseAdmin.from("zoho_events").insert({
          event_id: eventId,
          event_type: payload?.event_type ?? "contact",
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
          return new Response(
            JSON.stringify({ ok: true, skipped: "already processed" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        const result = await processZohoContact(payload, eventId);
        return new Response(
          JSON.stringify({ ok: result.ok, status: result.status, kind: "contact" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },

      GET: async () =>
        new Response("Zoho webhook ready (contacts only, open endpoint)", { status: 200 }),
    },
  },
});
