import type { FinancialYear } from '../types'
import {
  NOTES_TABLE_SECTIONS,
  getNoteSectionForTab,
  isNoteSectionTab,
  type NoteSectionTabId,
} from './fsDefaults'

export function buildShortFyLabel(startYear: number, endYear?: number) {
  const end = endYear ?? startYear + 1
  return `${String(startYear).slice(-2)}-${String(end).slice(-2)}`
}

export function parseShortFyStartYear(fyLabel: string) {
  const [start] = fyLabel.split('-')
  const year = Number(start)

  if (Number.isNaN(year)) {
    return new Date().getFullYear()
  }

  return year < 100 ? 2000 + year : year
}

export function getBusinessFyCellState(
  business: { id: string; startingYear: number; status?: string },
  fy: { endYear: number; closedBusinessIds?: string[] },
): 'active' | 'not-started' | 'closed' {
  if (business.status === 'inactive') {
    return 'closed'
  }

  if (business.startingYear > fy.endYear) {
    return 'not-started'
  }

  if (fy.closedBusinessIds?.includes(business.id)) {
    return 'closed'
  }

  return 'active'
}

export function getDefaultFyForBusiness<
  T extends { id: string; startingYear: number; status?: string },
  F extends { id: string; endYear: number; closedBusinessIds?: string[]; startYear: number },
>(business: T, financialYears: F[]): F | null {
  const sorted = sortFinancialYears(financialYears)
  const activeYears = sorted.filter((fy) => getBusinessFyCellState(business, fy) === 'active')
  return activeYears[activeYears.length - 1] ?? null
}

export function getEligibleBusinesses<T extends { startingYear: number }>(
  businesses: T[],
  endYear: number,
) {
  return businesses.filter((business) => business.startingYear <= endYear)
}

export function getBusinessesForFy<T extends { id: string; startingYear: number }>(
  businesses: T[],
  fy: { endYear: number; closedBusinessIds?: string[]; businessIds?: string[] },
) {
  const closed = fy.closedBusinessIds ?? migrateClosedFromLegacy(businesses, fy)
  return getEligibleBusinesses(businesses, fy.endYear).filter(
    (business) => !closed.includes(business.id),
  )
}

function migrateClosedFromLegacy<T extends { id: string; startingYear: number }>(
  businesses: T[],
  fy: { endYear: number; businessIds?: string[] },
) {
  if (!fy.businessIds) {
    return []
  }

  const eligible = getEligibleBusinesses(businesses, fy.endYear)
  return eligible.filter((b) => !fy.businessIds!.includes(b.id)).map((b) => b.id)
}

export function findPreviousFinancialYear(
  financialYears: FinancialYear[],
  currentFyId: string,
): FinancialYear | null {
  const sorted = sortFinancialYears(financialYears)
  const index = sorted.findIndex((item) => item.id === currentFyId)
  return index > 0 ? sorted[index - 1] : null
}

export function sortFinancialYears<T extends { startYear: number }>(financialYears: T[]): T[] {
  return [...financialYears].sort((a, b) => a.startYear - b.startYear)
}

export function findNextFinancialYear(
  financialYears: FinancialYear[],
  currentFyId: string,
): FinancialYear | null {
  const sorted = sortFinancialYears(financialYears)
  const index = sorted.findIndex((item) => item.id === currentFyId)
  return index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null
}

export function suggestNextFinancialYear(
  financialYears: Array<Pick<FinancialYear, 'startYear' | 'endYear'>> = [],
) {
  const sorted = sortFinancialYears(financialYears)
  const latest = sorted[sorted.length - 1]
  const start = latest ? latest.endYear : new Date().getFullYear()
  const end = start + 1
  return {
    startYear: start,
    endYear: end,
    label: buildShortFyLabel(start, end),
  }
}

export const FINANCIAL_STATEMENT_TYPES = [
  'Actual',
  'Provisional',
  'Projected',
  'Estimated',
  'Budgeted',
  'Revised',
] as const

export type FinancialStatementType = (typeof FINANCIAL_STATEMENT_TYPES)[number]

export function normalizeStatementType(value?: string): FinancialStatementType {
  if (value && FINANCIAL_STATEMENT_TYPES.includes(value as FinancialStatementType)) {
    return value as FinancialStatementType
  }
  return 'Actual'
}

export type FinancialYearStatus = 'active' | 'inactive'

export function normalizeFinancialYearStatus(value?: string | null): FinancialYearStatus {
  return value === 'inactive' ? 'inactive' : 'active'
}

export function isActiveFinancialYear(fy: { status?: string | null }): boolean {
  return normalizeFinancialYearStatus(fy.status) === 'active'
}

export function getActiveFinancialYears<T extends { status?: string | null }>(
  financialYears: T[],
): T[] {
  return financialYears.filter((fy) => isActiveFinancialYear(fy))
}

export function getFinancialYearStatusLabel(status?: string | null): string {
  return normalizeFinancialYearStatus(status) === 'inactive' ? 'Inactive' : 'Active'
}

export function formatFyDisplay(fy: { label: string; statementType?: string }) {
  const type = normalizeStatementType(fy.statementType)
  return type === 'Actual' ? fy.label : `${fy.label} (${type})`
}

export const DEFAULT_VISIBLE_FY_COUNT = 4

export function getVisibleFinancialYears<T extends { startYear: number }>(
  financialYears: T[],
  earlierVisibleCount: number,
  maxVisible = DEFAULT_VISIBLE_FY_COUNT,
): T[] {
  if (financialYears.length <= maxVisible) {
    return financialYears
  }

  const hiddenEarlierCount = financialYears.length - maxVisible
  const visibleEarlierCount = Math.min(earlierVisibleCount, hiddenEarlierCount)
  const startIndex = financialYears.length - maxVisible - visibleEarlierCount

  return financialYears.slice(startIndex, startIndex + maxVisible)
}

export function getFsYearPillWindow(
  financialYears: FinancialYear[],
  currentFyId: string,
  earlierVisibleCount: number,
): FinancialYear[] {
  const sorted = sortFinancialYears(financialYears)
  if (sorted.length <= DEFAULT_VISIBLE_FY_COUNT) {
    return sorted
  }

  const currentIndex = sorted.findIndex((fy) => fy.id === currentFyId)
  const hiddenEarlierCount = sorted.length - DEFAULT_VISIBLE_FY_COUNT
  const visibleEarlierCount = Math.min(earlierVisibleCount, hiddenEarlierCount)
  let startIndex = sorted.length - DEFAULT_VISIBLE_FY_COUNT - visibleEarlierCount

  if (currentIndex >= 0) {
    if (currentIndex < startIndex) {
      startIndex = currentIndex
    } else if (currentIndex >= startIndex + DEFAULT_VISIBLE_FY_COUNT) {
      startIndex = currentIndex - DEFAULT_VISIBLE_FY_COUNT + 1
    }
  }

  startIndex = Math.max(0, Math.min(startIndex, sorted.length - DEFAULT_VISIBLE_FY_COUNT))
  return sorted.slice(startIndex, startIndex + DEFAULT_VISIBLE_FY_COUNT)
}

export function getStatementTypeQualifier(statementType?: string): string {
  const type = normalizeStatementType(statementType)
  return type === 'Actual' ? '' : type
}

export function formatFinancialStatementPageTitle(statementType?: string): string {
  const qualifier = getStatementTypeQualifier(statementType)
  return qualifier ? `${qualifier} Financial Statement` : 'Financial Statement'
}

export function formatBalanceSheetTabLabel(statementType?: string): string {
  const qualifier = getStatementTypeQualifier(statementType)
  return qualifier ? `${qualifier} BS` : 'Balance Sheet'
}

export function formatProfitLossTabLabel(statementType?: string): string {
  const qualifier = getStatementTypeQualifier(statementType)
  return qualifier ? `${qualifier} P&L` : 'P&L'
}

export function formatNotesTabLabel(statementType?: string): string {
  const qualifier = getStatementTypeQualifier(statementType)
  return qualifier ? `${qualifier} Notes` : 'Notes'
}

export function formatBalanceSheetReportTitle(statementType?: string): string {
  const qualifier = getStatementTypeQualifier(statementType)
  return qualifier ? `${qualifier} Balance Sheet` : 'Balance Sheet'
}

export function formatFyEndDateShort(endYear: number): string {
  return `31.03.${endYear}`
}

export function formatFyEndDateLong(endYear: number): string {
  return `31st March ${endYear}`
}

export function formatBalanceSheetColumnLabel(endYear: number): string {
  return `As on ${formatFyEndDateShort(endYear)}`
}

export function formatBalanceSheetPrintColumnLabel(endYear: number): string {
  return `As at ${formatFyEndDateLong(endYear)}`
}

export function formatProfitLossColumnLabelCompact(endYear: number): string {
  return `Year ended ${formatFyEndDateShort(endYear)}`
}

export function formatProfitLossColumnLabel(endYear: number): string {
  return `Year ended ${formatFyEndDateLong(endYear)}`
}

export function formatPrintReportPeriod(
  reportKind: 'balance-sheet' | 'profit-loss' | 'notes' | 'other',
  fy: Pick<FinancialYear, 'endYear'>,
): string {
  if (reportKind === 'balance-sheet') {
    return formatBalanceSheetColumnLabel(fy.endYear)
  }
  return formatProfitLossColumnLabelCompact(fy.endYear)
}

export function formatPrintReportPeriodLong(
  reportKind: 'balance-sheet' | 'profit-loss' | 'notes' | 'other',
  fy: Pick<FinancialYear, 'endYear'>,
): string {
  const endLabel = formatFyEndDateLong(fy.endYear)
  if (reportKind === 'balance-sheet') {
    return `As at ${endLabel}`
  }
  return `For the year ended ${endLabel}`
}

export function formatPrintDate(value: Date = new Date()): string {
  return value.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function formatProfitLossReportTitle(statementType?: string): string {
  const qualifier = getStatementTypeQualifier(statementType)
  return qualifier ? `${qualifier} Profit & Loss Account` : 'Profit & Loss Account'
}

export function formatNotesReportTitle(statementType?: string): string {
  const qualifier = getStatementTypeQualifier(statementType)
  return qualifier ? `${qualifier} Notes to Accounts` : 'Notes to Accounts'
}

export type FsPrintTab =
  | 'balance-sheet'
  | 'profit-loss'
  | 'notes'
  | NoteSectionTabId
  | 'depreciation'
  | 'repayment'
  | 'bank-account'
  | 'gst-reco'
  | 'final-info'
  | 'udin-details'

export function formatFsTabPrintTitle(tab: FsPrintTab, statementType?: string): string {
  const noteSection = isNoteSectionTab(tab) ? getNoteSectionForTab(tab) : undefined
  if (noteSection) {
    return `${formatNotesReportTitle(statementType)} — ${noteSection.title}`
  }

  switch (tab) {
    case 'balance-sheet':
      return formatBalanceSheetReportTitle(statementType)
    case 'profit-loss':
      return formatProfitLossReportTitle(statementType)
    case 'notes':
      return formatNotesReportTitle(statementType)
    case 'depreciation':
      return 'Depreciation Schedule'
    case 'repayment':
      return 'Loan Repayment Schedule'
    case 'bank-account':
      return 'Bank Accounts'
    case 'gst-reco':
      return 'GST Reconciliation'
    case 'final-info':
      return 'Final Info'
    case 'udin-details':
      return 'UDIN Details'
    default:
      return 'Financial Statement'
  }
}

export function buildFsTabOptions(statementType?: string): Array<[FsPrintTab, string]> {
  const noteSectionTabs = NOTES_TABLE_SECTIONS.map(
    (section) => [section.tabId, section.tabLabel] as [FsPrintTab, string],
  )

  return [
    ['balance-sheet', formatBalanceSheetTabLabel(statementType)],
    ['profit-loss', formatProfitLossTabLabel(statementType)],
    ['notes', formatNotesTabLabel(statementType)],
    ...noteSectionTabs,
    ['depreciation', 'Depreciation Schedule'],
    ['repayment', 'Repayment Schedule'],
    ['bank-account', 'Bank Account'],
    ['gst-reco', 'GST Reco'],
  ]
}

export function validateSequentialFinancialYears(
  financialYears: Array<Pick<FinancialYear, 'startYear'>>,
): string | null {
  if (financialYears.length === 0) {
    return null
  }

  const sorted = sortFinancialYears(financialYears)
  const seen = new Set<number>()

  for (const fy of sorted) {
    if (seen.has(fy.startYear)) {
      return 'Each financial year can only be added once.'
    }
    seen.add(fy.startYear)
  }

  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startYear !== sorted[index - 1].startYear + 1) {
      return 'Financial years must be added in order with no gaps.'
    }
  }

  return null
}

export function getNextFinancialYearToAdd(
  financialYears: Array<Pick<FinancialYear, 'startYear' | 'endYear'>> = [],
) {
  const sorted = sortFinancialYears(financialYears)
  const latest = sorted[sorted.length - 1]
  const startYear = latest ? latest.endYear : null

  if (startYear === null) {
    return null
  }

  const endYear = startYear + 1
  return {
    startYear,
    endYear,
    label: buildShortFyLabel(startYear, endYear),
  }
}

export function getInitialFinancialYearOptions() {
  const currentYear = new Date().getFullYear()
  const startYears = [currentYear - 1, currentYear, currentYear + 1]

  return startYears.map((startYear) => {
    const endYear = startYear + 1
    return {
      startYear,
      endYear,
      label: buildShortFyLabel(startYear, endYear),
    }
  })
}

export function canDeleteFinancialYear(
  financialYears: Array<Pick<FinancialYear, 'id' | 'startYear'>>,
  fyId: string,
) {
  const sorted = sortFinancialYears(financialYears)
  return sorted[sorted.length - 1]?.id === fyId
}

export function buildFinancialYearEntry(startYear: number) {
  const endYear = startYear + 1
  return {
    startYear,
    endYear,
    label: buildShortFyLabel(startYear, endYear),
  }
}

export function getAvailableFinancialYearOptions(
  financialYears: Array<Pick<FinancialYear, 'id' | 'startYear' | 'endYear'>> = [],
  options: { excludeFyId?: string; pastYears?: number; futureYears?: number } = {},
) {
  const { excludeFyId, pastYears = 15, futureYears = 5 } = options
  const sorted = sortFinancialYears(financialYears)

  if (sorted.length === 0) {
    return getInitialFinancialYearOptions()
  }

  const occupied = new Set(
    sorted.filter((fy) => fy.id !== excludeFyId).map((fy) => fy.startYear),
  )
  const currentYear = new Date().getFullYear()
  const earliest = sorted[0].startYear
  const latestEnd = sorted[sorted.length - 1].endYear
  const minStart = Math.min(earliest - pastYears, currentYear - 1)
  const maxStart = Math.max(latestEnd + futureYears - 1, currentYear + 1)
  const yearOptions = []

  for (let startYear = minStart; startYear <= maxStart; startYear += 1) {
    if (!occupied.has(startYear)) {
      yearOptions.push(buildFinancialYearEntry(startYear))
    }
  }

  return yearOptions
}

export function getAutoFillYearsPreview(
  financialYears: Array<Pick<FinancialYear, 'id' | 'startYear'>>,
  targetStartYear: number,
  replaceFyId?: string,
) {
  const sorted = sortFinancialYears(financialYears)
  const existingStarts = new Set(sorted.map((fy) => fy.startYear))

  if (replaceFyId) {
    const editing = sorted.find((fy) => fy.id === replaceFyId)
    if (editing) {
      existingStarts.delete(editing.startYear)
    }
  }

  if (existingStarts.has(targetStartYear)) {
    return []
  }

  const allStarts = [...existingStarts, targetStartYear]
  const minStart = Math.min(...allStarts)
  const maxStart = Math.max(...allStarts)
  const preview = []

  for (let startYear = minStart; startYear <= maxStart; startYear += 1) {
    if (!existingStarts.has(startYear) && startYear !== targetStartYear) {
      preview.push(buildFinancialYearEntry(startYear))
    }
  }

  return preview
}

type MergeableFinancialYear = Pick<
  FinancialYear,
  'id' | 'label' | 'startYear' | 'endYear' | 'statementType' | 'createdAt'
>

export function mergeFinancialYearRange(
  existing: MergeableFinancialYear[],
  params: { targetStartYear: number; replaceFyId?: string },
  createId: () => string,
): MergeableFinancialYear[] | { error: string } {
  const sorted = sortFinancialYears(existing)
  const byStartYear = new Map(sorted.map((fy) => [fy.startYear, fy]))

  if (params.replaceFyId) {
    const editing = sorted.find((fy) => fy.id === params.replaceFyId)
    if (!editing) {
      return { error: 'Financial year not found.' }
    }

    const duplicate = sorted.find(
      (fy) => fy.startYear === params.targetStartYear && fy.id !== params.replaceFyId,
    )
    if (duplicate) {
      return { error: 'This financial year already exists.' }
    }

    byStartYear.delete(editing.startYear)
    const entry = buildFinancialYearEntry(params.targetStartYear)
    byStartYear.set(params.targetStartYear, {
      ...editing,
      ...entry,
    })
  } else if (byStartYear.has(params.targetStartYear)) {
    return { error: 'This financial year already exists.' }
  } else {
    const entry = buildFinancialYearEntry(params.targetStartYear)
    byStartYear.set(params.targetStartYear, {
      id: createId(),
      ...entry,
      statementType: 'Actual',
      createdAt: new Date().toISOString(),
    })
  }

  const startYears = [...byStartYear.keys()]
  const minStart = Math.min(...startYears)
  const maxStart = Math.max(...startYears)
  const now = new Date().toISOString()
  const result: MergeableFinancialYear[] = []

  for (let startYear = minStart; startYear <= maxStart; startYear += 1) {
    const fy = byStartYear.get(startYear)
    if (fy) {
      result.push(fy)
    } else {
      const entry = buildFinancialYearEntry(startYear)
      result.push({
        id: createId(),
        ...entry,
        statementType: 'Actual',
        createdAt: now,
      })
    }
  }

  return result
}

export function getFinancialYearOptions(
  financialYears: Array<Pick<FinancialYear, 'startYear' | 'endYear'>> = [],
  extraYears = 2,
) {
  const startYears = new Set<number>()
  const currentYear = new Date().getFullYear()

  startYears.add(currentYear - 1)
  startYears.add(currentYear)

  for (const fy of financialYears) {
    startYears.add(fy.startYear)
  }

  const suggested = suggestNextFinancialYear(financialYears)
  startYears.add(suggested.startYear)

  for (let offset = 1; offset <= extraYears; offset += 1) {
    startYears.add(suggested.startYear + offset)
  }

  return [...startYears]
    .sort((a, b) => a - b)
    .map((startYear) => {
      const endYear = startYear + 1
      return {
        startYear,
        endYear,
        label: buildShortFyLabel(startYear, endYear),
      }
    })
}
