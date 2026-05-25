import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmailServer } from "@/lib/email/send.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const adjustPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    targetUserId: z.string().uuid(),
    delta: z.number().int(),
    reason: z.string().min(1).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: profile, error } = await supabaseAdmin.from("profiles").select("points_balance, lifetime_points, email, full_name").eq("id", data.targetUserId).single();
    if (error || !profile) throw new Error("User not found");
    const newBalance = Math.max(0, profile.points_balance + data.delta);
    const newLifetime = data.delta > 0 ? profile.lifetime_points + data.delta : profile.lifetime_points;
    await supabaseAdmin.from("profiles").update({ points_balance: newBalance, lifetime_points: newLifetime }).eq("id", data.targetUserId);
    await supabaseAdmin.from("points_ledger").insert({
      user_id: data.targetUserId, delta: data.delta, reason: data.reason, source: "manual",
    });
    if (data.delta > 0 && profile.email) {
      try {
        await sendTransactionalEmailServer({
          templateName: "points-earned",
          recipientEmail: profile.email,
          idempotencyKey: `points-manual-${data.targetUserId}-${Date.now()}`,
          templateData: {
            name: profile.full_name ?? undefined,
            points: data.delta,
            reason: data.reason,
            newBalance,
          },
        });
      } catch (e) {
        console.error("Failed to send points-earned email", e);
      }
    }
    return { ok: true, newBalance };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    targetUserId: z.string().uuid(),
    role: z.enum(["admin", "user"]),
    grant: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.grant) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.targetUserId, role: data.role }, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId).eq("role", data.role);
    }
    return { ok: true };
  });

export const setPharmacyTotal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    pharmacyId: z.string().uuid(),
    newTotal: z.number().int().min(0),
    reason: z.string().min(1).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: members, error } = await supabaseAdmin
      .from("profiles")
      .select("id, points_balance, lifetime_points")
      .eq("pharmacy_id", data.pharmacyId);
    if (error) throw new Error(error.message);
    if (!members || members.length === 0) throw new Error("Pharmacy has no members to distribute to");

    const n = members.length;
    const base = Math.floor(data.newTotal / n);
    const remainder = data.newTotal - base * n;

    for (let i = 0; i < n; i++) {
      const m = members[i];
      const newBalance = base + (i < remainder ? 1 : 0);
      const delta = newBalance - m.points_balance;
      const newLifetime = delta > 0 ? m.lifetime_points + delta : m.lifetime_points;
      await supabaseAdmin.from("profiles").update({ points_balance: newBalance, lifetime_points: newLifetime }).eq("id", m.id);
      if (delta !== 0) {
        await supabaseAdmin.from("points_ledger").insert({
          user_id: m.id, delta, reason: data.reason, source: "pharmacy_split",
        });
      }
    }
    return { ok: true, members: n, perMember: base };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ targetUserId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.targetUserId === context.userId) throw new Error("You cannot delete your own account");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles } = await supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false });
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p) => ({ ...p, roles: roleMap.get(p.id) ?? [] }));
  });
