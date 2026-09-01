import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

import { template as pointsEarned } from './points-earned'
import { template as pointsExpiring } from './points-expiring'
import { template as zohoSyncAlert } from './zoho-sync-alert'
import { template as ticketsReady } from './tickets-ready'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'points-earned': pointsEarned,
  'points-expiring': pointsExpiring,
  'zoho-sync-alert': zohoSyncAlert,
  'tickets-ready': ticketsReady,
}
