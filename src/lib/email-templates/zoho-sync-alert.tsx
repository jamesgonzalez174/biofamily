import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'Biomed Family'
const SITE_URL = 'https://myprizepoint.com'

interface ZohoSyncAlertProps {
  status?: 'failed' | 'stuck'
  source?: string
  startedAt?: string
  finishedAt?: string
  errors?: string[]
  runId?: string
}

const ZohoSyncAlertEmail = ({
  status = 'failed',
  source = 'manual',
  startedAt,
  finishedAt,
  errors = [],
  runId,
}: ZohoSyncAlertProps) => {
  const title =
    status === 'stuck' ? 'Zoho sync appears stuck' : 'Zoho sync run failed'
  const preview =
    status === 'stuck'
      ? 'A Zoho sync run has not finished in time.'
      : 'A Zoho sync run just failed.'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{title}</Heading>
          <Section style={box}>
            <Text style={row}><strong>Status:</strong> {status}</Text>
            <Text style={row}><strong>Source:</strong> {source}</Text>
            {startedAt && <Text style={row}><strong>Started:</strong> {startedAt}</Text>}
            {finishedAt && <Text style={row}><strong>Finished:</strong> {finishedAt}</Text>}
            {runId && <Text style={row}><strong>Run ID:</strong> {runId}</Text>}
          </Section>
          {errors.length > 0 && (
            <Section style={box}>
              <Text style={label}>Errors</Text>
              {errors.map((e, i) => (
                <Text key={i} style={errText}>• {e}</Text>
              ))}
            </Section>
          )}
          <Button style={button} href={`${SITE_URL}/admin/settings`}>
            Open admin settings
          </Button>
          <Text style={footer}>
            You are receiving this because you are an admin of {SITE_NAME}.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ZohoSyncAlertEmail,
  subject: (data: Record<string, any>) =>
    data?.status === 'stuck'
      ? `[${SITE_NAME}] Zoho sync appears stuck`
      : `[${SITE_NAME}] Zoho sync run failed`,
  displayName: 'Zoho sync alert',
  previewData: {
    status: 'failed',
    source: 'manual',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    errors: ['page 3: invalid_token', 'invoice detail fetch failed'],
    runId: '00000000-0000-0000-0000-000000000000',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px' }
const h1 = { color: '#111827', fontSize: '22px', margin: '0 0 16px' }
const box = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px',
  margin: '12px 0',
}
const row = { color: '#111827', fontSize: '14px', margin: '4px 0' }
const label = { color: '#6b7280', fontSize: '12px', textTransform: 'uppercase' as const, margin: '0 0 6px' }
const errText = { color: '#b91c1c', fontSize: '13px', margin: '2px 0' }
const button = {
  backgroundColor: '#111827', color: '#ffffff', padding: '12px 20px',
  borderRadius: '8px', textDecoration: 'none', display: 'inline-block',
  fontSize: '14px', marginTop: '12px',
}
const footer = { color: '#6b7280', fontSize: '12px', marginTop: '20px' }
