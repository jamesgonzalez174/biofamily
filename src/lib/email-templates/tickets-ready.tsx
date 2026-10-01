import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BIOMED FAMILY'
const SITE_URL = 'https://myprizepoint.com'

interface InvoiceContribution {
  invoiceNumber: string
  tickets: number
}

interface TicketsReadyProps {
  name?: string
  tickets?: number
  raffleDate?: string
  invoices?: InvoiceContribution[]
}

const TicketsReadyEmail = ({
  name,
  tickets,
  raffleDate = 'December 18',
  invoices,
}: TicketsReadyProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your raffle tickets are ready to view</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your tickets are ready</Heading>
        <Text style={text}>{name ? `Hi ${name},` : 'Hi there,'}</Text>
        <Text style={text}>
          Raffle tickets are now live on your {SITE_NAME} dashboard. Every invoice
          earns tickets, and they are shared across the members of your pharmacy.
        </Text>
        {typeof tickets === 'number' && (
          <Section style={box}>
            <Text style={label}>Your ticket balance</Text>
            <Text style={big}>{tickets.toLocaleString()}</Text>
          </Section>
        )}
        {invoices && invoices.length > 0 && (
          <Section style={tableBox}>
            <Text style={label}>Invoices that earned tickets</Text>
            {invoices.map((inv) => (
              <Section key={inv.invoiceNumber} style={tableRow}>
                <Text style={cellLeft}>{inv.invoiceNumber}</Text>
                <Text style={cellRight}>
                  {inv.tickets.toLocaleString()} {inv.tickets === 1 ? 'ticket' : 'tickets'}
                </Text>
              </Section>
            ))}
            <Section style={totalRow}>
              <Text style={cellLeftBold}>Pharmacy total</Text>
              <Text style={cellRightBold}>
                {invoices.reduce((sum, i) => sum + i.tickets, 0).toLocaleString()} tickets
              </Text>
            </Section>
          </Section>
        )}
        <Text style={text}>
          Mark your calendar: the Christmas raffle draw takes place on{' '}
          <strong>{raffleDate}</strong>. Keep an eye on your ticket count between
          now and then.
        </Text>
        <Button style={button} href={`${SITE_URL}/dashboard`}>
          View my tickets
        </Button>
        <Text style={footer}>You are receiving this because you have a {SITE_NAME} account.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TicketsReadyEmail,
  subject: 'Your tickets are ready — Christmas raffle December 18',
  displayName: 'Tickets ready',
  previewData: {
    name: 'James',
    tickets: 42,
    raffleDate: 'December 18',
    invoices: [
      { invoiceNumber: 'FAC01-006031', tickets: 6 },
      { invoiceNumber: 'FAC01-006030', tickets: 1 },
      { invoiceNumber: 'FAC01-006029', tickets: 5 },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px' }
const h1 = { color: '#111827', fontSize: '24px', margin: '0 0 16px' }
const text = { color: '#374151', fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }
const box = {
  backgroundColor: '#f5f3ff',
  border: '1px solid #ddd6fe',
  borderRadius: '12px',
  padding: '16px',
  margin: '16px 0',
  textAlign: 'center' as const,
}
const label = {
  color: '#6d28d9', fontSize: '12px', textTransform: 'uppercase' as const,
  letterSpacing: '0.06em', margin: '0 0 4px',
}
const big = { color: '#4c1d95', fontSize: '32px', fontWeight: 700, margin: '0' }
const tableBox = {
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '12px 16px',
  margin: '16px 0',
}
const tableRow = { borderBottom: '1px solid #f3f4f6', padding: '6px 0' }
const totalRow = { padding: '8px 0 0' }
const cellLeft = {
  color: '#374151', fontSize: '14px', margin: '0', display: 'inline-block', width: '60%',
}
const cellRight = {
  color: '#374151', fontSize: '14px', margin: '0', display: 'inline-block',
  width: '40%', textAlign: 'right' as const,
}
const cellLeftBold = { ...cellLeft, fontWeight: 700, color: '#111827' }
const cellRightBold = { ...cellRight, fontWeight: 700, color: '#111827' }
const button = {
  backgroundColor: '#6d28d9', color: '#ffffff', padding: '12px 22px',
  borderRadius: '10px', textDecoration: 'none', display: 'inline-block',
  fontSize: '14px', fontWeight: 600, marginTop: '8px',
}
const footer = { color: '#6b7280', fontSize: '12px', marginTop: '24px' }
