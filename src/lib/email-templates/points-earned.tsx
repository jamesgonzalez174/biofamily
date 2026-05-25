import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'Biomed Family'
const SITE_URL = 'https://myprizepoint.com'

interface PointsEarnedProps {
  name?: string
  points?: number
  reason?: string
  newBalance?: number
}

const PointsEarnedEmail = ({ name, points = 0, reason, newBalance }: PointsEarnedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`You just earned ${points} points on ${SITE_NAME}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Nice work, ${name}!` : 'Nice work!'}
        </Heading>
        <Section style={pointsBox}>
          <Text style={pointsLabel}>You earned</Text>
          <Text style={pointsValue}>+{points} points</Text>
          {typeof newBalance === 'number' && (
            <Text style={balance}>New balance: {newBalance} points</Text>
          )}
        </Section>
        {reason && <Text style={text}>{reason}</Text>}
        <Button style={button} href={`${SITE_URL}/dashboard`}>View your dashboard</Button>
        <Text style={footer}>Keep collecting — bigger prizes are waiting.<br />The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PointsEarnedEmail,
  subject: (d: Record<string, any>) => `You earned ${d.points ?? 0} points on ${SITE_NAME}`,
  displayName: 'Points earned',
  previewData: { name: 'Jane', points: 50, reason: 'Zoho purchase', newBalance: 320 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 20px' }
const pointsBox = { backgroundColor: '#f5f3ff', borderRadius: '12px', padding: '24px', textAlign: 'center' as const, margin: '0 0 20px' }
const pointsLabel = { fontSize: '13px', color: '#6b7280', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const pointsValue = { fontSize: '36px', fontWeight: 'bold', color: '#7c3aed', margin: '0' }
const balance = { fontSize: '13px', color: '#6b7280', margin: '8px 0 0' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.5', margin: '0 0 20px' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 24px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold', display: 'inline-block' }
const footer = { fontSize: '12px', color: '#9ca3af', margin: '32px 0 0' }
