import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'
import { supabaseAdmin as _supabaseAdmin } from '@/integrations/supabase/client.server'

const supabaseAdmin = _supabaseAdmin as any

type Reason = 'bounce' | 'complaint' | 'unsubscribe'

function mapReasonToStatus(reason: Reason): 'bounced' | 'complained' | 'suppressed' {
  switch (reason) {
    case 'bounce':
      return 'bounced'
    case 'complaint':
      return 'complained'
    default:
      return 'suppressed'
  }
}

function mapReasonToMessage(reason: Reason): string {
  switch (reason) {
    case 'bounce':
      return 'Permanent bounce — email address is invalid or rejected'
    case 'complaint':
      return 'Spam complaint — recipient marked email as spam'
    default:
      return 'Recipient unsubscribed'
  }
}

// Notification-only bookkeeping: Lovable enforces suppression server-side.
async function record(recipient: string, reason: Reason, eventId: string) {
  const normalizedEmail = recipient.toLowerCase()

  const { error: suppressError } = await supabaseAdmin
    .from('suppressed_emails')
    .upsert({ email: normalizedEmail, reason, metadata: null }, { onConflict: 'email' })

  if (suppressError) {
    console.error('Failed to record suppression', {
      code: suppressError.code,
      message: suppressError.message,
      event_id: eventId,
    })
    throw new Error('Failed to record suppression')
  }

  const { error: logError } = await supabaseAdmin.from('email_send_log').insert({
    message_id: null,
    template_name: 'system',
    recipient_email: normalizedEmail,
    status: mapReasonToStatus(reason),
    error_message: mapReasonToMessage(reason),
  })

  if (logError) {
    console.error('Failed to write email_send_log', {
      code: logError.code,
      message: logError.message,
      event_id: eventId,
    })
    throw new Error('Failed to write email send log')
  }
}

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']
        if (!apiKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }
        const handler = createEmailWebhookHandler({
          apiKey,
          on: {
            'email.bounced': async (event) => {
              await record(event.data.recipient, 'bounce', event.event_id)
            },
            'email.complaint': async (event) => {
              await record(event.data.recipient, 'complaint', event.event_id)
            },
            'email.unsubscribed': async (event) => {
              await record(event.data.recipient, 'unsubscribe', event.event_id)
            },
          },
        })
        return handler(request)
      },
    },
  },
})
