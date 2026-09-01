import { supabaseAdmin as _supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendTemplateEmail } from '@/lib/email-templates/send-email'

const supabaseAdmin = _supabaseAdmin as any

async function logSend(row: {
  message_id: string | null
  template_name: string
  recipient_email: string
  status: 'sent' | 'suppressed' | 'failed'
  error_message?: string
}) {
  const { error } = await supabaseAdmin.from('email_send_log').insert(row)
  if (error) {
    console.error('Failed to write email_send_log', {
      code: error.code,
      message: error.message,
    })
  }
}

/**
 * Server-to-server transactional email sender.
 * Use from server functions and server routes.
 * Sends synchronously through Lovable's managed email API; suppression,
 * retries, rate limits, and unsubscribe are handled by Lovable.
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

  try {
    const result = await sendTemplateEmail(templateName, recipientEmail, {
      templateData,
      idempotencyKey,
    })

    if (!result.sent) {
      await logSend({
        message_id: messageId,
        template_name: templateName,
        recipient_email: recipientEmail,
        status: 'suppressed',
      })
      return { ok: false, reason: 'suppressed' }
    }

    await logSend({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipientEmail,
      status: 'sent',
    })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Failed to send transactional email', { templateName, message })
    await logSend({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipientEmail,
      status: 'failed',
      error_message: message.slice(0, 1000),
    })
    return { ok: false, reason: 'send_failed' }
  }
}
