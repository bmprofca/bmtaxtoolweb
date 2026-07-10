import type { Client } from '../types'
import { isProprietorshipType } from './businessUtils'

interface ExportBusinessInfo {
  name: string
  type?: string
  address?: string
}

export function buildExportBusinessHeaderLines(
  client: Client | null | undefined,
  business: ExportBusinessInfo | null | undefined,
  isConsolidated: boolean,
): string[] {
  if (!client) {
    return []
  }

  const entityName = isConsolidated ? client.name : business?.name || client.name
  const lines = [entityName]

  if (!isConsolidated && business?.type && isProprietorshipType(business.type)) {
    lines.push(`In Proprietorship of ${client.name}`)
  }

  if (isConsolidated) {
    lines.push('Consolidated Financial Statements')
  }

  const address = (isConsolidated ? client.address : business?.address || client.address || '').trim()
  const pin = client.pin?.trim() ? `PIN ${client.pin.trim()}` : ''
  const location = [address, pin].filter(Boolean).join(' · ')
  if (location) {
    lines.push(location)
  }

  return lines
}

export function buildExportBusinessHeaderHtml(
  client: Client | null | undefined,
  business: ExportBusinessInfo | null | undefined,
  isConsolidated: boolean,
  escapeHtml: (value: string) => string,
): string {
  const lines = buildExportBusinessHeaderLines(client, business, isConsolidated)
  if (!lines.length) {
    return ''
  }

  const [entityName, ...subLines] = lines
  return `
    <div class="export-business-header">
      <h2 class="export-entity-name">${escapeHtml(entityName)}</h2>
      ${subLines.map((line) => `<p class="export-subline">${escapeHtml(line)}</p>`).join('')}
    </div>
  `
}
