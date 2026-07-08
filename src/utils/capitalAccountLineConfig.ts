import type { CapitalAccountLine } from '../types/fs'

export type CapitalAccountLineSign = CapitalAccountLine['sign']

export const CAPITAL_ACCOUNT_ADD_TYPES = [
  { id: 'capital-introduced', label: 'Capital Introduced' },
  { id: 'partner-contribution', label: 'Partner Contribution' },
  { id: 'reserve-transfer', label: 'Reserve Transferred' },
  { id: 'share-premium', label: 'Share Premium' },
  { id: 'others-add', label: 'Others' },
] as const

export const CAPITAL_ACCOUNT_LESS_TYPES = [
  { id: 'drawings', label: 'Drawings' },
  { id: 'partner-withdrawal', label: 'Partner Withdrawal' },
  { id: 'capital-repayment', label: 'Capital Repayment' },
  { id: 'loss-adjustment', label: 'Loss Adjustment' },
  { id: 'others-less', label: 'Others' },
] as const

const addTypeMap = new Map(CAPITAL_ACCOUNT_ADD_TYPES.map((item) => [item.id, item.label]))
const lessTypeMap = new Map(CAPITAL_ACCOUNT_LESS_TYPES.map((item) => [item.id, item.label]))

export function capitalAccountLineSubId(lineId: string) {
  return `capital-line-${lineId}`
}

export function getCapitalAccountLineLabel(sign: CapitalAccountLineSign, typeId: string) {
  if (sign === 'add') {
    return addTypeMap.get(typeId as (typeof CAPITAL_ACCOUNT_ADD_TYPES)[number]['id']) ?? 'Others'
  }
  return lessTypeMap.get(typeId as (typeof CAPITAL_ACCOUNT_LESS_TYPES)[number]['id']) ?? 'Others'
}

export function getCapitalAccountLineTypes(sign: CapitalAccountLineSign) {
  return sign === 'add' ? CAPITAL_ACCOUNT_ADD_TYPES : CAPITAL_ACCOUNT_LESS_TYPES
}

export function normalizeCapitalAccountLineSign(sign: string | undefined): CapitalAccountLineSign {
  return sign === 'less' ? 'less' : 'add'
}

export function normalizeCapitalAccountLineTypeId(
  sign: CapitalAccountLineSign,
  typeId: string | undefined,
) {
  return typeId || (sign === 'add' ? 'capital-introduced' : 'drawings')
}

export function formatCapitalAccountLineLabel(sign: CapitalAccountLineSign, typeId: string) {
  const label = getCapitalAccountLineLabel(sign, typeId)
  return sign === 'add' ? `Add: ${label}` : `Less: ${label}`
}

function generateCapitalAccountLineId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function normalizeCapitalAccountLines(
  raw: CapitalAccountLine[] | undefined,
  _noteSubAmounts?: { capitalAccount?: Record<string, { current: number; previous: number }> },
): CapitalAccountLine[] {
  if (raw?.length) {
    return raw.map((line) => {
      const sign = normalizeCapitalAccountLineSign(line.sign)
      return {
        id: line.id || generateCapitalAccountLineId(),
        sign,
        typeId: normalizeCapitalAccountLineTypeId(sign, line.typeId),
      }
    })
  }

  return []
}

export function migrateCapitalAccountSubAmounts(
  lines: CapitalAccountLine[],
  noteSubAmounts: { capitalAccount?: Record<string, { current: number; previous: number }> },
) {
  const subs = { ...(noteSubAmounts.capitalAccount ?? {}) }
  const legacyDrawings = subs['less-drawings']

  if (legacyDrawings && !subs.drawings) {
    subs.drawings = legacyDrawings
    delete subs['less-drawings']
  }

  for (const line of lines) {
    const subId = capitalAccountLineSubId(line.id)
    if (!subs[subId]) {
      subs[subId] = { current: 0, previous: 0 }
    }
  }

  return { ...noteSubAmounts, capitalAccount: subs }
}
