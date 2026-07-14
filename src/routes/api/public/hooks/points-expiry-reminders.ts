import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin as _supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmailServer } from "@/lib/email/send.server";

const supabaseAdmin = _supabaseAdmin as any;

const BUCKETS = [
  { days: 30, key: "30d" },
  { days: 7, key: "7d" },
  { days: 1, key: "1d" },
];

export const Route = createFileRoute("/api/public/hooks/points-expiry-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("x-cron-secret") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
          "";
        const expected = process.env.CRON_SECRET;
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: settings } = await supabaseAdmin
          .from("settings").select("points_expire_at").eq("id", 1).single();
        const expireAt: string | null = settings?.points_expire_at ?? null;
        if (!expireAt) {
          return json({ ran: false, reason: "no_expiration_configured" });
        }

        const expire = new Date(expireAt);
        const now = new Date();
        const msPerDay = 86_400_000;
        const daysLeft = Math.ceil((expire.getTime() - now.getTime()) / msPerDay);
        const bucket = BUCKETS.find((b) => b.days === daysLeft);
        if (!bucket) {
          return json({ ran: false, reason: "no_bucket_today", daysLeft });
        }

        const expireISO = expire.toISOString().slice(0, 10);
        const expireLabel = expire.toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });

        const { data: users, error } = await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name, points_balance")
          .gt("points_balance", 0);
        if (error) {
          return json({ ran: false, error: error.message }, 500);
        }

        let sent = 0, skipped = 0, failed = 0;
        for (const u of users ?? []) {
          if (!u.email) { skipped++; continue; }
          const messageId = `expiry-${u.id}-${expireISO}-${bucket.key}`;

          // Dedup: if any row exists with this deterministic id, skip
          const { data: prior } = await supabaseAdmin
            .from("email_send_log").select("id").eq("message_id", messageId).limit(1).maybeSingle();
          if (prior) { skipped++; continue; }

          const res = await sendTransactionalEmailServer({
            templateName: "points-expiring",
            recipientEmail: u.email,
            messageId,
            idempotencyKey: messageId,
            templateData: {
              name: u.full_name ?? undefined,
              points: u.points_balance,
              daysLeft: bucket.days,
              expireDate: expireLabel,
            },
          });
          if (res.ok) sent++;
          else if (res.reason === "suppressed") skipped++;
          else failed++;
        }

        return json({ ran: true, bucket: bucket.key, daysLeft, sent, skipped, failed, total: users?.length ?? 0 });
      },
    },
  },
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
