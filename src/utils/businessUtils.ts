import type { BusinessStatus, Client, FinancialYear } from '../types'
import { buildShortFyLabel, getBusinessFyCellState, getEligibleBusinesses } from './financialYear'

export const BUSINESS_TYPES = [
  'Self',
  'Proprietorship',
  'Partnership',
  'LLP',
  'Private Limited',
  'Public Limited',
  'HUF',
  'Other',
] as const

export function isProprietorshipType(type: string) {
  return type.trim().toLowerCase() === 'proprietorship'
}

export function isSelfBusinessType(type: string) {
  return type.trim().toLowerCase() === 'self'
}

export function usesClientPanFallback(type: string) {
  return isProprietorshipType(type) || isSelfBusinessType(type)
}

export function formatClientAddressForBusiness(client: Pick<Client, 'address' | 'pin'>) {
  const address = client.address?.trim() || ''
  const pin = client.pin?.trim() || ''
  if (address && pin) {
    return `${address}, PIN ${pin}`
  }
  return address || (pin ? `PIN ${pin}` : '')
}

/** Copy client profile fields into a new self-owned business. */
export function getBusinessFieldsFromClient(client: Client) {
  return {
    name: client.name?.trim() || '',
    pan: client.pan?.trim() || '',
    address: formatClientAddressForBusiness(client),
  }
}

export function getBusinessStatusLabel(status?: BusinessStatus) {
  return status === 'inactive' ? 'Inactive' : 'Active'
}

export function formatBusinessDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function getFyCellStatusLabel(cellState: ReturnType<typeof getBusinessFyCellState>) {
  if (cellState === 'active') {
    return 'Active'
  }

  if (cellState === 'closed') {
    return 'Closed'
  }

  return 'Not started'
}

export function getNormalizedFinancialYears(client: Client): FinancialYear[] {
  return (client.financialYears || []).map((fy) => ({
    ...fy,
    statementType: fy.statementType || 'Actual',
    closedBusinessIds:
      fy.closedBusinessIds ??
      getEligibleBusinesses(client.businesses, fy.endYear)
        .filter((b) => !(fy as FinancialYear & { businessIds?: string[] }).businessIds?.includes(b.id))
        .map((b) => b.id),
  }))
}

export function normalizeClientBusinesses(client: Client) {
  return client.businesses.map((business) => ({
    ...business,
    pan: business.pan || '',
    address: business.address || '',
    gstNumber: business.gstNumber || '',
    status: (business.status === 'inactive' ? 'inactive' : 'active') as BusinessStatus,
    startingFy:
      business.startingFy ||
      buildShortFyLabel(business.startingYear, business.startingYear + 1),
  }))
}
