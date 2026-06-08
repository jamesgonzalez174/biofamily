import { createFileRoute } from "@tanstack/react-router";
import { runZohoSync } from "@/lib/zoho-sync.server";

export const Route = createFileRoute("/api/public/hooks/daily-zoho-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require a server-only shared secret. The anon/publishable key is
        // shipped to browsers, so it cannot be used to gate this endpoint.
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

        const result = await runZohoSync({ notify: true, source: "cron" });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
