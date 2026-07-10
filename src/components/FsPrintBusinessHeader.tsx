import type { Client } from '../types'
import { isProprietorshipType } from '../utils/businessUtils'

interface PrintBusinessInfo {
  name: string
  type?: string
  pan?: string
  address?: string
  gstNumber?: string
}

interface FsPrintBusinessHeaderProps {
  client: Client
  business: PrintBusinessInfo | null
  isConsolidated: boolean
}

function buildAddressLine(client: Client, business: PrintBusinessInfo | null, isConsolidated: boolean) {
  const address = (isConsolidated ? client.address : business?.address || client.address || '').trim()
  return address || ''
}

function buildPinLine(client: Client) {
  return client.pin?.trim() ? `PIN ${client.pin.trim()}` : ''
}

function FsPrintBusinessHeader({ client, business, isConsolidated }: FsPrintBusinessHeaderProps) {
  const isProprietorship = Boolean(business?.type && isProprietorshipType(business.type))
  const addressLine = buildAddressLine(client, business, isConsolidated)
  const pinLine = buildPinLine(client)
  const locationLine = [addressLine, pinLine].filter(Boolean).join(' · ')
  const entityName = isConsolidated ? client.name : business?.name || client.name

  return (
    <div className="fs-print-header-center fs-print-header-business fs-print-client-header">
      <h1 className="fs-print-business-name">{entityName}</h1>

      {!isConsolidated && isProprietorship && (
        <p className="fs-print-proprietorship">In Proprietorship of {client.name}</p>
      )}

      {isConsolidated && (
        <p className="fs-print-proprietorship">Consolidated Financial Statements</p>
      )}

      {locationLine && <p className="fs-print-location">{locationLine}</p>}
    </div>
  )
}

export default FsPrintBusinessHeader
