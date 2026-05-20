import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const redeemPrize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prizeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: prize, error: pErr } = await supabaseAdmin
      .from("prizes").select("*").eq("id", data.prizeId).single();
    if (pErr || !prize) throw new Error("Prize not found");
    if (!prize.is_active) throw new Error("Prize is not available");
    if (prize.stock <= 0) throw new Error("Prize is out of stock");

    const { data: profile, error: prErr } = await supabaseAdmin
      .from("profiles").select("points_balance").eq("id", userId).single();
    if (prErr || !profile) throw new Error("Profile not found");
    if (profile.points_balance < prize.point_cost) throw new Error("Not enough points");

    // Reserve stock (points are NOT deducted until admin marks claimed)
    const { error: sErr } = await supabaseAdmin
      .from("prizes").update({ stock: prize.stock - 1 }).eq("id", prize.id).gt("stock", 0);
    if (sErr) throw new Error("Failed to reserve stock");

    const { data: red, error: rErr } = await supabaseAdmin.from("redemptions").insert({
      user_id: userId, prize_id: prize.id, prize_name: prize.name,
      points_spent: prize.point_cost, status: "pending",
    }).select().single();
    if (rErr) {
      await supabaseAdmin.from("prizes").update({ stock: prize.stock }).eq("id", prize.id);
      throw new Error("Failed to create redemption");
    }

    return { ok: true, redemption: { id: red.id, prize_name: red.prize_name, points_spent: red.points_spent } };
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

    // Deduct points when transitioning into claimed
    if (becomingClaimed) {
      const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles").select("points_balance, lifetime_points").eq("id", red.user_id).single();
      if (pErr || !profile) throw new Error("User profile not found");
      if (profile.points_balance < red.points_spent) throw new Error("User no longer has enough points");

      const { error: bErr } = await supabaseAdmin
        .from("profiles").update({ points_balance: profile.points_balance - red.points_spent })
        .eq("id", red.user_id);
      if (bErr) throw new Error("Failed to deduct points");

      await supabaseAdmin.from("points_ledger").insert({
        user_id: red.user_id, delta: -red.points_spent,
        reason: `Claimed: ${red.prize_name}`, source: "redemption", reference: red.id,
      });
    }

    // Restore stock when cancelling a not-yet-claimed redemption
    if (becomingCancelled && !wasClaimed) {
      const { data: prize } = await supabaseAdmin
        .from("prizes").select("stock").eq("id", red.prize_id).single();
      if (prize) {
        await supabaseAdmin.from("prizes").update({ stock: prize.stock + 1 }).eq("id", red.prize_id);
      }
    }

    // Refund points if reversing a claim back to a non-claimed state
    if (wasClaimed && data.status !== "claimed") {
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("points_balance").eq("id", red.user_id).single();
      if (profile) {
        await supabaseAdmin.from("profiles").update({
          points_balance: profile.points_balance + red.points_spent,
        }).eq("id", red.user_id);
        await supabaseAdmin.from("points_ledger").insert({
          user_id: red.user_id, delta: red.points_spent,
          reason: `Reversed claim: ${red.prize_name}`, source: "redemption", reference: red.id,
        });
      }
    }

    const patch: any = { status: data.status, updated_at: new Date().toISOString() };
    if (data.tracking_info !== undefined) patch.tracking_info = data.tracking_info;
    const { error: uErr } = await supabaseAdmin.from("redemptions").update(patch).eq("id", red.id);
    if (uErr) throw new Error("Failed to update redemption");

    return { ok: true };
  });
