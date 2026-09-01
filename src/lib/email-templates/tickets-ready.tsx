import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BIOMED FAMILY'
const SITE_URL = 'https://myprizepoint.com'

interface TicketsReadyProps {
  name?: string
  tickets?: number
  raffleDate?: string
}

const TicketsReadyEmail = ({
  name,
  tickets,
  raffleDate = 'December 18',
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
  previewData: { name: 'James', tickets: 42, raffleDate: 'December 18' },
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
const button = {
  backgroundColor: '#6d28d9', color: '#ffffff', padding: '12px 22px',
  borderRadius: '10px', textDecoration: 'none', display: 'inline-block',
  fontSize: '14px', fontWeight: 600, marginTop: '8px',
}
const footer = { color: '#6b7280', fontSize: '12px', marginTop: '24px' }
