import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const redeemPrize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prizeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Atomic: locks the profile row + prize row, validates balance/stock,
    // decrements stock, and inserts the redemption — all in one transaction.
    const { data: red, error } = await supabaseAdmin.rpc("create_redemption", {
      _user_id: userId,
      _prize_id: data.prizeId,
    });
    if (error || !red) throw new Error(error?.message || "Failed to create redemption");

    const r = Array.isArray(red) ? red[0] : red;
    return { ok: true, redemption: { id: r.id, prize_name: r.prize_name, points_spent: r.points_spent } };
  });


export const updateRedemptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    redemptionId: z.string().uuid(),
    status: z.enum(["pending", "shipped", "claimed", "cancelled"]),
    tracking_info: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Verify caller is admin
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Admin only");

    const { data: red, error: rErr } = await supabaseAdmin
      .from("redemptions").select("*").eq("id", data.redemptionId).single();
    if (rErr || !red) throw new Error("Redemption not found");

    const wasClaimed = red.status === "claimed";
    const wasCancelled = red.status === "cancelled";
    const becomingClaimed = data.status === "claimed" && !wasClaimed;
    const becomingCancelled = data.status === "cancelled" && !wasCancelled;

    // Points were already deducted at redemption time. Nothing to do on claim.

    // Atomic cancel: locks row, refunds points, restores stock, writes ledger,
    // and updates status — all in one DB transaction. Safe against double-clicks.
    if (becomingCancelled && !wasClaimed) {
      const { error: cErr } = await supabaseAdmin.rpc("cancel_redemption", { _red_id: red.id });
      if (cErr) throw new Error(cErr.message || "Failed to cancel redemption");
      if (data.tracking_info !== undefined) {
        await supabaseAdmin.from("redemptions")
          .update({ tracking_info: data.tracking_info })
          .eq("id", red.id);
      }
      return { ok: true };
    }

    const patch: any = { status: data.status, updated_at: new Date().toISOString() };
    if (data.tracking_info !== undefined) patch.tracking_info = data.tracking_info;
    const { error: uErr } = await supabaseAdmin.from("redemptions").update(patch).eq("id", red.id);
    if (uErr) throw new Error("Failed to update redemption");

    return { ok: true };
  });
