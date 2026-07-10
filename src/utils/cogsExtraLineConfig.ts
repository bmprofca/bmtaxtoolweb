import type { CogsExtraLine } from '../types/fs'

export type CogsExtraLineSign = CogsExtraLine['sign']

export const COGS_EXTRA_ADD_TYPES = [
  { id: 'direct-expenses', label: 'Direct Expenses' },
  { id: 'freight-inward', label: 'Freight Inward' },
  { id: 'wages-direct', label: 'Wages (Direct)' },
  { id: 'packing-charges', label: 'Packing Charges' },
  { id: 'others-add', label: 'Others' },
] as const

export const COGS_EXTRA_LESS_TYPES = [
  { id: 'others-less', label: 'Others' },
] as const

const addTypeMap = new Map(COGS_EXTRA_ADD_TYPES.map((item) => [item.id, item.label]))
const lessTypeMap = new Map(COGS_EXTRA_LESS_TYPES.map((item) => [item.id, item.label]))

export function cogsExtraLineSubId(lineId: string) {
  return `cogs-line-${lineId}`
}

export function isCogsExtraDynamicLine(noteKey: keyof import('../types/fs').FsNotes, sub: { id: string }) {
  return noteKey === 'costOfGoodsSold' && sub.id.startsWith('cogs-line-')
}

export function getCogsExtraLineLabel(sign: CogsExtraLineSign, typeId: string) {
  if (sign === 'add') {
    return addTypeMap.get(typeId as (typeof COGS_EXTRA_ADD_TYPES)[number]['id']) ?? 'Others'
  }
  return lessTypeMap.get(typeId as (typeof COGS_EXTRA_LESS_TYPES)[number]['id']) ?? 'Others'
}

export function getCogsExtraLineTypes(sign: CogsExtraLineSign) {
  return sign === 'add' ? COGS_EXTRA_ADD_TYPES : COGS_EXTRA_LESS_TYPES
}

export function normalizeCogsExtraLineSign(sign: string | undefined): CogsExtraLineSign {
  return sign === 'less' ? 'less' : 'add'
}

export function normalizeCogsExtraLineTypeId(sign: CogsExtraLineSign, typeId: string | undefined) {
  return typeId || (sign === 'add' ? 'direct-expenses' : 'others-less')
}

export function formatCogsExtraLineLabel(sign: CogsExtraLineSign, typeId: string) {
  const label = getCogsExtraLineLabel(sign, typeId)
  return sign === 'add' ? `Add: ${label}` : `Less: ${label}`
}

function generateCogsExtraLineId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function normalizeCogsExtraLines(
  raw: CogsExtraLine[] | undefined,
): CogsExtraLine[] {
  if (!raw?.length) {
    return []
  }

  return raw.map((line) => {
    const sign = normalizeCogsExtraLineSign(line.sign)
    return {
      id: line.id || generateCogsExtraLineId(),
      sign,
      typeId: normalizeCogsExtraLineTypeId(sign, line.typeId),
    }
  })
}

export function migrateCogsExtraSubAmounts(
  lines: CogsExtraLine[],
  noteSubAmounts: { costOfGoodsSold?: Record<string, { current: number; previous: number }> },
) {
  const subs = { ...(noteSubAmounts.costOfGoodsSold ?? {}) }

  for (const line of lines) {
    const subId = cogsExtraLineSubId(line.id)
    if (!subs[subId]) {
      subs[subId] = { current: 0, previous: 0 }
    }
  }

  return { ...noteSubAmounts, costOfGoodsSold: subs }
}
