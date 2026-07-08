import type { FinancialYear } from '../types'
import { validateSequentialFinancialYears } from './financialYear'

export interface GlobalFinancialYear {
  id: string
  label: string
  startYear: number
  endYear: number
  statementType: string
  createdAt: string
  isDeleted?: boolean
  deletedAt?: string | null
}

export function normalizeGlobalFinancialYear(raw: GlobalFinancialYear): GlobalFinancialYear | null {
  const startYear = Number(raw.startYear)
  const endYear = Number(raw.endYear)

  if (!startYear || !endYear || endYear !== startYear + 1) {
    return null
  }

  const label =
    raw.label?.trim() ||
    `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`

  return {
    id: raw.id,
    label,
    startYear,
    endYear,
    statementType: raw.statementType?.trim() || 'Actual',
    createdAt: raw.createdAt || new Date().toISOString(),
    isDeleted: raw.isDeleted,
    deletedAt: raw.deletedAt ?? null,
  }
}

export function normalizeGlobalFinancialYears(
  raw: GlobalFinancialYear[] | undefined,
): GlobalFinancialYear[] {
  if (!raw?.length) {
    return []
  }

  return raw
    .map((item) => normalizeGlobalFinancialYear(item))
    .filter((item): item is GlobalFinancialYear => item !== null)
    .sort((a, b) => a.startYear - b.startYear)
}

export function validateGlobalFinancialYearSequence(
  financialYears: GlobalFinancialYear[],
): string | null {
  return validateSequentialFinancialYears(financialYears)
}

export function generateGlobalFinancialYearId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function mergeClientFinancialYears(
  globalYears: GlobalFinancialYear[],
  fyClosedOverrides: Record<string, string[]> | undefined,
): FinancialYear[] {
  const overrides = fyClosedOverrides || {}

  return globalYears.map((fy) => ({
    ...fy,
    closedBusinessIds: overrides[fy.id] || [],
  }))
}
