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

export const addPharmacyPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    pharmacyId: z.string().uuid(),
    amount: z.number().int(),
    reason: z.string().min(1).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.amount === 0) throw new Error("Amount must be non-zero");
    const { data: members, error } = await supabaseAdmin
      .from("profiles")
      .select("id, points_balance, lifetime_points, email, full_name")
      .eq("pharmacy_id", data.pharmacyId);
    if (error) throw new Error(error.message);
    if (!members || members.length === 0) throw new Error("Pharmacy has no members to distribute to");

    const n = members.length;
    const abs = Math.abs(data.amount);
    const sign = data.amount > 0 ? 1 : -1;
    // Equal split — floor so every member gets the same amount.
    // Any fractional remainder is dropped (points are whole numbers).
    const base = Math.floor(abs / n);

    for (let i = 0; i < n; i++) {
      const m = members[i];
      const share = base * sign;
      if (share === 0) continue;
      const newBalance = Math.max(0, m.points_balance + share);
      const delta = newBalance - m.points_balance;
      const newLifetime = delta > 0 ? m.lifetime_points + delta : m.lifetime_points;
      await supabaseAdmin.from("profiles").update({ points_balance: newBalance, lifetime_points: newLifetime }).eq("id", m.id);
      if (delta !== 0) {
        await supabaseAdmin.from("points_ledger").insert({
          user_id: m.id, delta, reason: data.reason, source: "pharmacy_split",
        });
      }
      if (delta > 0 && (m as any).email) {
        try {
          await sendTransactionalEmailServer({
            templateName: "points-earned",
            recipientEmail: (m as any).email,
            idempotencyKey: `points-pharmacy-${data.pharmacyId}-${m.id}-${Date.now()}`,
            templateData: {
              name: (m as any).full_name ?? undefined,
              points: delta,
              reason: data.reason,
              newBalance,
            },
          });
        } catch (e) {
          console.error("Failed to send points-earned email", e);
        }
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
    const [profilesRes, rolesRes, pharmaciesRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, phone, pharmacy_id, tier, points_balance, lifetime_points, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("pharmacies").select("id, name").order("name"),
    ]);
    const roleMap = new Map<string, string[]>();
    (rolesRes.data ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    const users = (profilesRes.data ?? []).map((p) => ({ ...p, roles: roleMap.get(p.id) ?? [] }));
    return { users, pharmacies: pharmaciesRes.data ?? [] };
  });

export const sendTestExpiryReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name, points_balance")
      .eq("id", context.userId)
      .single();
    if (!profile?.email) throw new Error("Your profile has no email address");

    const { data: settings } = await supabaseAdmin
      .from("settings").select("points_expire_at").eq("id", 1).single();
    const expireAt = (settings as any)?.points_expire_at as string | null;

    let daysLeft = 7;
    let expireLabel = "soon";
    if (expireAt) {
      const expire = new Date(expireAt);
      const ms = expire.getTime() - Date.now();
      daysLeft = Math.max(1, Math.ceil(ms / 86_400_000));
      expireLabel = expire.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    const res = await sendTransactionalEmailServer({
      templateName: "points-expiring",
      recipientEmail: profile.email,
      idempotencyKey: `expiry-test-${context.userId}-${Date.now()}`,
      templateData: {
        name: profile.full_name ?? undefined,
        points: profile.points_balance || 500,
        daysLeft,
        expireDate: expireLabel,
      },
    });
    if (!res.ok) throw new Error(res.reason ?? "Failed to send test email");
    return { ok: true, sentTo: profile.email };
  });
