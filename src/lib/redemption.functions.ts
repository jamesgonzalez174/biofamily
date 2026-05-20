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

    // Decrement stock
    const { error: sErr } = await supabaseAdmin
      .from("prizes").update({ stock: prize.stock - 1 }).eq("id", prize.id).gt("stock", 0);
    if (sErr) throw new Error("Failed to reserve stock");

    // Deduct balance
    const newBalance = profile.points_balance - prize.point_cost;
    const { error: bErr } = await supabaseAdmin
      .from("profiles").update({ points_balance: newBalance }).eq("id", userId);
    if (bErr) {
      await supabaseAdmin.from("prizes").update({ stock: prize.stock }).eq("id", prize.id);
      throw new Error("Failed to update balance");
    }

    // Ledger
    await supabaseAdmin.from("points_ledger").insert({
      user_id: userId, delta: -prize.point_cost, reason: `Redeemed: ${prize.name}`, source: "redemption", reference: prize.id,
    });

    // Redemption record
    const { data: red, error: rErr } = await supabaseAdmin.from("redemptions").insert({
      user_id: userId, prize_id: prize.id, prize_name: prize.name, points_spent: prize.point_cost,
    }).select().single();
    if (rErr) throw new Error("Failed to create redemption");

    return { ok: true, redemption: { id: red.id, prize_name: red.prize_name, points_spent: red.points_spent }, newBalance };
  });
