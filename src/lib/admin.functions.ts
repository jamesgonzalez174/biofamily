import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmailServer } from "@/lib/email/send.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

async function logAudit(params: {
  actorUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  details?: Record<string, any>;
}) {
  try {
    const { data: actor } = await supabaseAdmin
      .from("profiles").select("email").eq("id", params.actorUserId).maybeSingle();
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_user_id: params.actorUserId,
      actor_email: actor?.email ?? null,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      target_label: params.targetLabel ?? null,
      details: params.details ?? {},
    });
  } catch (e) {
    console.error("audit log write failed", e);
  }
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
    await logAudit({
      actorUserId: context.userId,
      action: "adjust_points",
      targetType: "user",
      targetId: data.targetUserId,
      targetLabel: profile.full_name || profile.email || undefined,
      details: { delta: data.delta, reason: data.reason, newBalance },
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
    const { data: profile } = await supabaseAdmin.from("profiles").select("full_name, email").eq("id", data.targetUserId).maybeSingle();
    await logAudit({
      actorUserId: context.userId,
      action: data.grant ? "grant_role" : "revoke_role",
      targetType: "user",
      targetId: data.targetUserId,
      targetLabel: profile?.full_name || profile?.email || undefined,
      details: { role: data.role },
    });
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
    const { data: pharm } = await supabaseAdmin.from("pharmacies").select("name").eq("id", data.pharmacyId).maybeSingle();
    await logAudit({
      actorUserId: context.userId,
      action: "pharmacy_points",
      targetType: "pharmacy",
      targetId: data.pharmacyId,
      targetLabel: pharm?.name ?? undefined,
      details: { amount: data.amount, reason: data.reason, members: n, perMember: base },
    });
    return { ok: true, members: n, perMember: base };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ targetUserId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.targetUserId === context.userId) throw new Error("You cannot delete your own account");
    const { data: profile } = await supabaseAdmin.from("profiles").select("full_name, email").eq("id", data.targetUserId).maybeSingle();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
    if (error) throw new Error(error.message);
    await logAudit({
      actorUserId: context.userId,
      action: "delete_user",
      targetType: "user",
      targetId: data.targetUserId,
      targetLabel: profile?.full_name || profile?.email || undefined,
      details: {},
    });
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

// ---------- Audit log ----------

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    limit: z.number().int().min(1).max(500).optional(),
    action: z.string().optional(),
    targetId: z.string().optional(),
    targetType: z.string().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("admin_audit_log")
      .select("id, actor_user_id, actor_email, action, target_type, target_id, target_label, details, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.action) q = q.eq("action", data.action);
    if (data.targetId) q = q.eq("target_id", data.targetId);
    if (data.targetType) q = q.eq("target_type", data.targetType);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// Generic audit logger for admin pages that mutate directly via RLS
// (prizes, SKUs, settings, fulfillment) instead of a dedicated server fn.
export const logAdminAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    action: z.string().min(1).max(60),
    targetType: z.string().min(1).max(40).optional(),
    targetId: z.string().max(120).optional(),
    targetLabel: z.string().max(200).optional(),
    details: z.record(z.string(), z.any()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await logAudit({
      actorUserId: context.userId,
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      targetLabel: data.targetLabel,
      details: data.details,
    });
    return { ok: true };
  });

// Retry a failed (DLQ) email by moving it back into its main queue.
export const retryEmailFromDlq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    messageId: z.string().min(1),
    recipient: z.string().optional(),
    template: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: res, error } = await supabaseAdmin.rpc("retry_dlq_message" as any, {
      _message_id: data.messageId,
    });
    if (error) throw new Error(error.message);
    const retried = !!(res as any)?.retried;
    if (retried) {
      await logAudit({
        actorUserId: context.userId,
        action: "email_retry",
        targetType: "email",
        targetId: data.messageId,
        targetLabel: data.recipient ?? data.template,
        details: { template: data.template, recipient: data.recipient },
      });
    }
    return { ok: retried, message: retried ? "Re-queued" : "Message not found in DLQ" };
  });

// ---------- Email dashboard ----------

export const listEmailLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    days: z.number().int().min(1).max(365).optional(),
    template: z.string().optional(),
    status: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const days = data.days ?? 7;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    // Pull recent rows, then dedupe by message_id keeping the latest per id.
    const { data: rows, error } = await supabaseAdmin
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    const latestByMid = new Map<string, any>();
    for (const r of rows ?? []) {
      const key = r.message_id ?? r.id;
      if (!latestByMid.has(key)) latestByMid.set(key, r);
    }
    let dedup = Array.from(latestByMid.values());
    if (data.template) dedup = dedup.filter((r) => r.template_name === data.template);
    if (data.status) dedup = dedup.filter((r) => r.status === data.status);

    const stats = {
      total: dedup.length,
      sent: dedup.filter((r) => r.status === "sent").length,
      failed: dedup.filter((r) => r.status === "dlq" || r.status === "failed" || r.status === "bounced").length,
      suppressed: dedup.filter((r) => r.status === "suppressed").length,
      pending: dedup.filter((r) => r.status === "pending").length,
    };
    const templates = Array.from(new Set((rows ?? []).map((r) => r.template_name).filter(Boolean))).sort();
    return {
      rows: dedup.slice(0, data.limit ?? 200),
      stats,
      templates,
    };
  });

// ---------- Bulk CSV points import ----------

const bulkRowSchema = z.object({
  identifier: z.string().min(1),
  delta: z.number().int(),
  reason: z.string().min(1).max(200),
});

export const bulkImportPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    rows: z.array(bulkRowSchema).min(1).max(2000),
    dryRun: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const results: Array<{ row: number; identifier: string; ok: boolean; message: string; delta?: number; newBalance?: number }> = [];
    let successCount = 0;
    let totalDelta = 0;

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      const rowNum = i + 1;
      try {
        const isEmail = row.identifier.includes("@");
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, points_balance, lifetime_points")
          .eq(isEmail ? "email" : "id", isEmail ? row.identifier.toLowerCase() : row.identifier)
          .maybeSingle();
        if (!profile) {
          results.push({ row: rowNum, identifier: row.identifier, ok: false, message: "User not found" });
          continue;
        }
        const newBalance = Math.max(0, profile.points_balance + row.delta);
        const appliedDelta = newBalance - profile.points_balance;
        if (data.dryRun) {
          results.push({ row: rowNum, identifier: row.identifier, ok: true, message: "Would apply", delta: appliedDelta, newBalance });
          continue;
        }
        const newLifetime = appliedDelta > 0 ? profile.lifetime_points + appliedDelta : profile.lifetime_points;
        await supabaseAdmin.from("profiles").update({ points_balance: newBalance, lifetime_points: newLifetime }).eq("id", profile.id);
        if (appliedDelta !== 0) {
          await supabaseAdmin.from("points_ledger").insert({
            user_id: profile.id, delta: appliedDelta, reason: row.reason, source: "bulk_import",
          });
        }
        if (appliedDelta > 0 && profile.email) {
          try {
            await sendTransactionalEmailServer({
              templateName: "points-earned",
              recipientEmail: profile.email,
              idempotencyKey: `bulk-${context.userId}-${profile.id}-${Date.now()}-${i}`,
              templateData: {
                name: profile.full_name ?? undefined,
                points: appliedDelta,
                reason: row.reason,
                newBalance,
              },
            });
          } catch {}
        }
        successCount++;
        totalDelta += appliedDelta;
        results.push({ row: rowNum, identifier: row.identifier, ok: true, message: "Applied", delta: appliedDelta, newBalance });
      } catch (e: any) {
        results.push({ row: rowNum, identifier: row.identifier, ok: false, message: e?.message ?? "Error" });
      }
    }

    if (!data.dryRun) {
      await logAudit({
        actorUserId: context.userId,
        action: "bulk_import_points",
        targetType: "batch",
        details: {
          total: data.rows.length,
          succeeded: successCount,
          failed: data.rows.length - successCount,
          netDelta: totalDelta,
        },
      });
    }

    return {
      results,
      stats: {
        total: data.rows.length,
        succeeded: successCount,
        failed: data.rows.length - successCount,
        netDelta: totalDelta,
      },
      dryRun: !!data.dryRun,
    };
  });

// ---------- Analytics ----------

export const getAdminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(365).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const [ledgerRes, redemptionsRes, profilesRes, pharmaciesRes] = await Promise.all([
      supabaseAdmin.from("points_ledger").select("user_id, delta, source, reason, created_at").gte("created_at", since),
      supabaseAdmin.from("redemptions").select("id, user_id, prize_id, prize_name, points_spent, status, created_at").gte("created_at", since),
      supabaseAdmin.from("profiles").select("id, full_name, email, pharmacy_id, points_balance, lifetime_points"),
      supabaseAdmin.from("pharmacies").select("id, name"),
    ]);

    const ledger = ledgerRes.data ?? [];
    const redemptions = redemptionsRes.data ?? [];
    const profiles = profilesRes.data ?? [];
    const pharmacies = pharmaciesRes.data ?? [];
    const nameById = new Map(profiles.map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 6)]));
    const pharmacyNameById = new Map(pharmacies.map((p) => [p.id, p.name]));

    // Top earners in window
    const earnedByUser = new Map<string, number>();
    let pointsIssued = 0;
    let pointsSpent = 0;
    for (const l of ledger) {
      if (l.delta > 0) {
        earnedByUser.set(l.user_id, (earnedByUser.get(l.user_id) ?? 0) + l.delta);
        pointsIssued += l.delta;
      } else {
        pointsSpent += Math.abs(l.delta);
      }
    }
    const topEarners = Array.from(earnedByUser.entries())
      .map(([uid, earned]) => ({ userId: uid, name: nameById.get(uid) ?? "Unknown", earned }))
      .sort((a, b) => b.earned - a.earned)
      .slice(0, 10);

    // Top prizes
    const prizeAgg = new Map<string, { name: string; count: number; points: number }>();
    for (const r of redemptions) {
      if (r.status === "cancelled") continue;
      const key = r.prize_id ?? r.prize_name;
      const cur = prizeAgg.get(key) ?? { name: r.prize_name, count: 0, points: 0 };
      cur.count += 1;
      cur.points += r.points_spent;
      prizeAgg.set(key, cur);
    }
    const topPrizes = Array.from(prizeAgg.values()).sort((a, b) => b.count - a.count).slice(0, 10);

    // Pharmacy leaderboard (lifetime totals across current members)
    const pharmAgg = new Map<string, { name: string; members: number; lifetime: number; balance: number }>();
    for (const p of profiles) {
      if (!p.pharmacy_id) continue;
      const name = pharmacyNameById.get(p.pharmacy_id) ?? "Unknown";
      const cur = pharmAgg.get(p.pharmacy_id) ?? { name, members: 0, lifetime: 0, balance: 0 };
      cur.members += 1;
      cur.lifetime += p.lifetime_points ?? 0;
      cur.balance += p.points_balance ?? 0;
      pharmAgg.set(p.pharmacy_id, cur);
    }
    const pharmacyLeaderboard = Array.from(pharmAgg.values()).sort((a, b) => b.lifetime - a.lifetime).slice(0, 10);

    // Redemption rate
    const redemptionRate = pointsIssued > 0 ? Math.min(100, Math.round((pointsSpent / pointsIssued) * 100)) : 0;

    // Redemption status breakdown
    const statusCounts: Record<string, number> = {};
    for (const r of redemptions) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

    return {
      windowDays: days,
      pointsIssued,
      pointsSpent,
      redemptionRate,
      redemptionsTotal: redemptions.length,
      activeEarners: earnedByUser.size,
      topEarners,
      topPrizes,
      pharmacyLeaderboard,
      statusCounts,
    };
  });
