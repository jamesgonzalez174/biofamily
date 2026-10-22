import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ticketAdjustmentSchema } from "./ticket-adjustment-schema";

export const adjustTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ticketAdjustmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("adjust_member_tickets", {
      _user_id: data.targetUserId, _delta: data.delta, _reason: data.reason, _request_id: data.requestId,
    });
    if (error) throw new Error(error.message);
    return result;
  });