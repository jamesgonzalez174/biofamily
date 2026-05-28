import { createFileRoute } from "@tanstack/react-router";
import { runZohoSync } from "@/lib/zoho-sync.server";

export const Route = createFileRoute("/api/public/hooks/daily-zoho-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require the project's anon/publishable key via the standard `apikey` header.
        const apikey = request.headers.get("apikey");
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ||
          process.env.SUPABASE_ANON_KEY ||
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !expected || apikey !== expected) {
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
