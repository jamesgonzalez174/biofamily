import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'Biomed Family'
const SITE_URL = 'https://myprizepoint.com'

interface PointsExpiringProps {
  name?: string
  points?: number
  daysLeft?: number
  expireDate?: string
}

const PointsExpiringEmail = ({ name, points = 0, daysLeft = 0, expireDate }: PointsExpiringProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Your ${points} points expire in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `${name}, don't lose your points` : `Don't lose your points`}
        </Heading>
        <Section style={pointsBox}>
          <Text style={pointsLabel}>Expiring soon</Text>
          <Text style={pointsValue}>{points} points</Text>
          <Text style={sub}>
            {daysLeft === 1
              ? `Expires tomorrow${expireDate ? ` (${expireDate})` : ''}`
              : `Expires in ${daysLeft} days${expireDate ? ` on ${expireDate}` : ''}`}
          </Text>
        </Section>
        <Text style={text}>
          Redeem your points for prizes in the catalog before they reset. Once the expiration date passes, your balance drops to zero.
        </Text>
        <Button style={button} href={`${SITE_URL}/catalog`}>Redeem now</Button>
        <Text style={footer}>Thanks for being part of {SITE_NAME}.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PointsExpiringEmail,
  subject: (d: Record<string, any>) =>
    `Your ${d.points ?? 0} points expire in ${d.daysLeft ?? 0} day${d.daysLeft === 1 ? '' : 's'}`,
  displayName: 'Points expiring',
  previewData: { name: 'Jane', points: 320, daysLeft: 7, expireDate: 'Sep 15, 2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 20px' }
const pointsBox = { backgroundColor: '#fef2f2', borderRadius: '12px', padding: '24px', textAlign: 'center' as const, margin: '0 0 20px', border: '1px solid #fecaca' }
const pointsLabel = { fontSize: '13px', color: '#991b1b', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const pointsValue = { fontSize: '36px', fontWeight: 'bold', color: '#dc2626', margin: '0' }
const sub = { fontSize: '13px', color: '#7f1d1d', margin: '8px 0 0' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.5', margin: '0 0 20px' }
const button = { backgroundColor: '#dc2626', color: '#ffffff', padding: '12px 24px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold', display: 'inline-block' }
const footer = { fontSize: '12px', color: '#9ca3af', margin: '32px 0 0' }
