import { supabaseAdmin as _supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendTransactionalEmailServer } from './send.server'

const supabaseAdmin = _supabaseAdmin as any

/**
 * Notify every member credited by an invoice's point distribution.
 * Idempotent: the message_id is deterministic per (invoice, user), and we skip
 * anyone who already has a log row for it — so re-syncs never re-send.
 */
export async function notifyInvoicePointsCredited(params: {
  zohoInvoiceId: string
  invoiceNumber?: string | null
}): Promise<{ sent: number; skipped: number; failed: number }> {
  let sent = 0, skipped = 0, failed = 0
  try {
    const { data: ledger } = await supabaseAdmin
      .from('points_ledger')
      .select('user_id, delta, reason')
      .eq('source', 'zoho_invoice')
      .eq('reference', params.zohoInvoiceId)
    const rows = (ledger ?? []).filter((r: any) => Number(r.delta) > 0)
    if (rows.length === 0) return { sent, skipped, failed }

    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, points_balance')
      .in('id', rows.map((r: any) => r.user_id))
    const byId = new Map<string, any>((profs ?? []).map((p: any) => [p.id as string, p]))

    for (const r of rows as any[]) {
      const p = byId.get(r.user_id)
      if (!p?.email) { skipped++; continue }
      const messageId = `points-invoice-${params.zohoInvoiceId}-${r.user_id}`

      const { data: prior } = await supabaseAdmin
        .from('email_send_log')
        .select('id')
        .eq('message_id', messageId)
        .limit(1)
        .maybeSingle()
      if (prior) { skipped++; continue }

      const res = await sendTransactionalEmailServer({
        templateName: 'points-earned',
        recipientEmail: p.email,
        messageId,
        idempotencyKey: messageId,
        templateData: {
          name: p.full_name ?? undefined,
          points: Number(r.delta),
          reason: r.reason ?? `Invoice ${params.invoiceNumber ?? params.zohoInvoiceId}`,
          newBalance: Number(p.points_balance ?? 0),
        },
      })
      if (res.ok) sent++
      else if (res.reason === 'suppressed') skipped++
      else failed++
    }
  } catch (e) {
    console.error('notifyInvoicePointsCredited failed', e)
  }
  return { sent, skipped, failed }
}

/**
 * Notify pharmacy members the FIRST time raffle tickets are credited to them.
 * Event-driven (one recipient, triggered by their own pharmacy's invoice) and
 * idempotent: one "tickets ready" notice per user, ever.
 */
export async function notifyTicketsCredited(params: {
  pharmacyId: string
}): Promise<{ sent: number; skipped: number; failed: number }> {
  let sent = 0, skipped = 0, failed = 0
  try {
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('tickets_enabled')
      .eq('id', 1)
      .maybeSingle()
    if (!settings?.tickets_enabled) return { sent, skipped, failed }

    const [{ data: direct }, { data: access }] = await Promise.all([
      supabaseAdmin.from('profiles').select('id').eq('pharmacy_id', params.pharmacyId),
      supabaseAdmin.from('user_pharmacy_access').select('user_id').eq('pharmacy_id', params.pharmacyId),
    ])
    const ids = new Set<string>([
      ...((direct ?? []) as any[]).map((r) => r.id as string),
      ...((access ?? []) as any[]).map((r) => r.user_id as string),
    ])
    if (ids.size === 0) return { sent, skipped, failed }

    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, tickets')
      .in('id', [...ids])

    for (const p of (profs ?? []) as any[]) {
      if (!p?.email || Number(p.tickets ?? 0) <= 0) { skipped++; continue }
      const messageId = `tickets-ready-first-${p.id}`

      const { data: prior } = await supabaseAdmin
        .from('email_send_log')
        .select('id')
        .eq('message_id', messageId)
        .limit(1)
        .maybeSingle()
      if (prior) { skipped++; continue }

      const res = await sendTransactionalEmailServer({
        templateName: 'tickets-ready',
        recipientEmail: p.email,
        messageId,
        idempotencyKey: messageId,
        templateData: {
          name: p.full_name ?? undefined,
          tickets: Number(p.tickets ?? 0),
          raffleDate: 'December 18',
        },
      })
      if (res.ok) sent++
      else if (res.reason === 'suppressed') skipped++
      else failed++
    }
  } catch (e) {
    console.error('notifyTicketsCredited failed', e)
  }
  return { sent, skipped, failed }
}
