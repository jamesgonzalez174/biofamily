import * as React from 'react'
import { render } from '@react-email/components'
import { supabaseAdmin as _supabaseAdmin } from '@/integrations/supabase/client.server'
const supabaseAdmin = _supabaseAdmin as any
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'Biomed Family'
const SENDER_DOMAIN = 'notify.myprizepoint.com'
const FROM_DOMAIN = 'notify.myprizepoint.com'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Server-to-server transactional email sender.
 * Use from server functions (where there's no user JWT available).
 * Handles suppression check, unsubscribe token, render, and enqueue.
 */
export async function sendTransactionalEmailServer(params: {
  templateName: string
  recipientEmail: string
  idempotencyKey?: string
  templateData?: Record<string, any>
  messageId?: string
}): Promise<{ ok: boolean; reason?: string }> {
  const { templateName, recipientEmail, templateData = {} } = params
  const messageId = params.messageId || crypto.randomUUID()
  const idempotencyKey = params.idempotencyKey || messageId

  const template = TEMPLATES[templateName]
  if (!template) {
    console.error('Template not found', { templateName })
    return { ok: false, reason: 'template_not_found' }
  }

  const effectiveRecipient = template.to || recipientEmail
  if (!effectiveRecipient) return { ok: false, reason: 'no_recipient' }
  const normalizedEmail = effectiveRecipient.toLowerCase()

  // Suppression
  const { data: suppressed } = await supabaseAdmin
    .from('suppressed_emails').select('id').eq('email', normalizedEmail).maybeSingle()
  if (suppressed) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId, template_name: templateName,
      recipient_email: effectiveRecipient, status: 'suppressed',
    })
    return { ok: false, reason: 'suppressed' }
  }

  // Unsubscribe token (one per email)
  let unsubscribeToken: string
  const { data: existing } = await supabaseAdmin
    .from('email_unsubscribe_tokens').select('token, used_at').eq('email', normalizedEmail).maybeSingle()
  if (existing?.used_at) {
    return { ok: false, reason: 'suppressed' }
  }
  if (existing) {
    unsubscribeToken = existing.token
  } else {
    unsubscribeToken = generateToken()
    await supabaseAdmin.from('email_unsubscribe_tokens').upsert(
      { token: unsubscribeToken, email: normalizedEmail },
      { onConflict: 'email', ignoreDuplicates: true },
    )
    const { data: stored } = await supabaseAdmin
      .from('email_unsubscribe_tokens').select('token').eq('email', normalizedEmail).maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token
  }

  // Render
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject = typeof template.subject === 'function'
    ? template.subject(templateData) : template.subject

  // Log pending and enqueue
  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId, template_name: templateName,
    recipient_email: effectiveRecipient, status: 'pending',
  })

  const { error } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject, html, text,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (error) {
    console.error('Failed to enqueue', { error, templateName })
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId, template_name: templateName,
      recipient_email: effectiveRecipient, status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    return { ok: false, reason: 'enqueue_failed' }
  }

  return { ok: true }
}
