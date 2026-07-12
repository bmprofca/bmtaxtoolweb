import type { ReactNode } from 'react'
import type { Client } from '../types'
import type { CaProfile } from '../types/caProfile'

export interface PrintBusinessInfo {
  name: string
  type?: string
  pan?: string
  address?: string
  gstNumber?: string
}

export interface PrintHeaderProps {
  client: Client
  business: PrintBusinessInfo | null
  isConsolidated: boolean
  title?: string
  period?: string
  showClientDetails?: boolean
  fixed?: boolean
}

export interface PrintFooterProps {
  clientName: string
  showCaSigning?: boolean
  caProfile?: CaProfile
  udinNumber?: string
  udinDate?: string
  sealOffsetX?: number
  sealOffsetY?: number
  variant?: 'client' | 'ca'
}

export interface PrintSectionProps {
  children: ReactNode
  className?: string
  breakBefore?: boolean
  tabId?: string
  printTitle?: string
}

export interface PrintTableProps {
  children: ReactNode
  className?: string
  variant?: 'statement' | 'notes' | 'schedule' | 'data'
}

export interface PrintPageProps {
  children: ReactNode
  className?: string
}
