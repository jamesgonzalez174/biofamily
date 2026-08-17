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
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p]))

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
