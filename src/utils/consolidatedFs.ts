import type { Business } from '../types'
import type {
  FinancialStatementData,
  FsNotes,
  NoteBreakdownCell,
  NoteBreakdowns,
  NoteSubAmounts,
  NoteSubCell,
  NoteValue,
  PreviousYearDepreciationSummary,
} from '../types/fs'
import { createEmptyGstReco } from './gstDefaults'
import { getBusinessFyCellState, getBusinessesForFy } from './financialYear'
import { NOTE_FIELDS } from './fsDefaults'

export const CONSOLIDATED_BUSINESS_ID = 'consolidated'

export const CONSOLIDATED_BUSINESS_LABEL = 'Consolidated Balance Sheet'

export function isConsolidatedBusinessId(businessId: string | undefined) {
  return businessId === CONSOLIDATED_BUSINESS_ID
}

export function getActiveBusinessCountForFy(
  businesses: Business[],
  fy: { endYear: number; closedBusinessIds?: string[] },
) {
  return businesses.filter((business) => getBusinessFyCellState(business, fy) === 'active').length
}

export function isConsolidatedApplicableForFy(
  businesses: Business[],
  fy: { endYear: number; closedBusinessIds?: string[] },
) {
  return getActiveBusinessCountForFy(businesses, fy) >= 2
}

export function getConsolidatedFyCellState(
  businesses: Business[],
  fy: { endYear: number; closedBusinessIds?: string[] },
): 'active' | 'not-started' | 'closed' {
  const activeCount = getActiveBusinessCountForFy(businesses, fy)

  if (activeCount >= 2) {
    return 'active'
  }

  const states = businesses.map((business) => getBusinessFyCellState(business, fy))

  if (states.every((state) => state === 'closed')) {
    return 'closed'
  }

  return 'not-started'
}

export function getDefaultFyForConsolidated<
  F extends { id: string; endYear: number; closedBusinessIds?: string[]; startYear: number },
>(businesses: Business[], financialYears: F[]): F | null {
  const sorted = [...financialYears].sort((a, b) => a.startYear - b.startYear)
  const activeYears = sorted.filter((fy) => getConsolidatedFyCellState(businesses, fy) === 'active')
  return activeYears[activeYears.length - 1] ?? null
}

function sumNoteValue(left: NoteValue, right: NoteValue): NoteValue {
  return {
    current: (left.current || 0) + (right.current || 0),
    previous: (left.previous || 0) + (right.previous || 0),
  }
}

function sumSubCell(left: NoteSubCell | undefined, right: NoteSubCell | undefined): NoteSubCell {
  return {
    current: (left?.current || 0) + (right?.current || 0),
    previous: (left?.previous || 0) + (right?.previous || 0),
  }
}

function mergeFsNotes(records: FsNotes[]): FsNotes {
  const keys = NOTE_FIELDS.map((field) => field.key)
  const merged = {} as FsNotes

  for (const key of keys) {
    merged[key] = records.reduce(
      (total, notes) => sumNoteValue(total, notes[key] || { current: 0, previous: 0 }),
      { current: 0, previous: 0 },
    )
  }

  return merged
}

function mergeNoteSubAmounts(records: NoteSubAmounts[]): NoteSubAmounts {
  const merged: NoteSubAmounts = {}

  for (const record of records) {
    for (const noteKey of Object.keys(record) as Array<keyof FsNotes>) {
      const subs = record[noteKey]
      if (!subs) {
        continue
      }

      merged[noteKey] = merged[noteKey] || {}

      for (const [subId, cell] of Object.entries(subs)) {
        merged[noteKey]![subId] = sumSubCell(merged[noteKey]![subId], cell)
      }
    }
  }

  return merged
}

function mergeBreakdownRows(
  left: NoteBreakdownCell['current'],
  right: NoteBreakdownCell['current'],
) {
  const byParticular = new Map<string, number>()

  for (const row of [...left, ...right]) {
    const key = row.particular.trim().toLowerCase()
    byParticular.set(key, (byParticular.get(key) || 0) + (row.amount || 0))
  }

  return [...byParticular.entries()].map(([particular, amount], index) => ({
    id: `merged-${index}`,
    particular: particular.replace(/\b\w/g, (char) => char.toUpperCase()),
    amount,
  }))
}

function mergeNoteBreakdowns(records: NoteBreakdowns[]): NoteBreakdowns {
  const merged: NoteBreakdowns = {}

  for (const record of records) {
    for (const noteKey of Object.keys(record) as Array<keyof FsNotes>) {
      const cell = record[noteKey]
      if (!cell) {
        continue
      }

      const existing = merged[noteKey]
      merged[noteKey] = {
        current: mergeBreakdownRows(existing?.current || [], cell.current || []),
        previous: mergeBreakdownRows(existing?.previous || [], cell.previous || []),
      }
    }
  }

  return merged
}

function mergeAmountMap<T extends Record<string, NoteSubCell>>(records: T[]): T {
  const merged = {} as T

  for (const record of records) {
    for (const [key, cell] of Object.entries(record)) {
      merged[key as keyof T] = sumSubCell(
        merged[key as keyof T] as NoteSubCell | undefined,
        cell,
      ) as T[keyof T]
    }
  }

  return merged
}

function mergePreviousYearDepreciation(
  records: PreviousYearDepreciationSummary[],
): PreviousYearDepreciationSummary {
  return records.reduce(
    (total, item) => ({
      openingWdv: total.openingWdv + (item.openingWdv || 0),
      additionBeforeOct3: total.additionBeforeOct3 + (item.additionBeforeOct3 || 0),
      additionOnAfterOct3: total.additionOnAfterOct3 + (item.additionOnAfterOct3 || 0),
      assetDeletion: total.assetDeletion + (item.assetDeletion || 0),
      depreciation: total.depreciation + (item.depreciation || 0),
      closingWdv: total.closingWdv + (item.closingWdv || 0),
    }),
    {
      openingWdv: 0,
      additionBeforeOct3: 0,
      additionOnAfterOct3: 0,
      assetDeletion: 0,
      depreciation: 0,
      closingWdv: 0,
    },
  )
}

export function mergeFinancialStatementData(
  clientId: string,
  fyId: string,
  records: FinancialStatementData[],
): FinancialStatementData {
  if (records.length === 0) {
    throw new Error('No financial statements available to consolidate.')
  }

  if (records.length === 1) {
    return {
      ...records[0],
      businessId: CONSOLIDATED_BUSINESS_ID,
      clientId,
      fyId,
    }
  }

  const latestUpdatedAt = records
    .map((record) => record.updatedAt)
    .sort()
    .reverse()[0]

  return {
    clientId,
    fyId,
    businessId: CONSOLIDATED_BUSINESS_ID,
    notes: mergeFsNotes(records.map((record) => record.notes)),
    noteBreakdowns: mergeNoteBreakdowns(records.map((record) => record.noteBreakdowns || {})),
    noteSubAmounts: mergeNoteSubAmounts(records.map((record) => record.noteSubAmounts || {})),
    administrativeExpenseLines: records.flatMap((record) => record.administrativeExpenseLines || []),
    otherShortTermBorrowingLines: records.flatMap(
      (record) => record.otherShortTermBorrowingLines || [],
    ),
    manualNoteLines: records.flatMap((record) => record.manualNoteLines || []),
    capitalAccountLines: records.flatMap((record) => record.capitalAccountLines || []),
    cogsExtraLines: records.flatMap((record) => record.cogsExtraLines || []),
    plAppropriationLines: records.flatMap((record) => record.plAppropriationLines || []),
    plAppropriationAmounts: mergeAmountMap(
      records.map((record) => record.plAppropriationAmounts || {}),
    ),
    depreciationSchedule: records.flatMap((record) => record.depreciationSchedule || []),
    previousYearDepreciation: mergePreviousYearDepreciation(
      records.map((record) => record.previousYearDepreciation),
    ),
    loans: records.flatMap((record) => record.loans || []),
    bankAccounts: records.flatMap((record) => record.bankAccounts || []),
    gstReco: createEmptyGstReco(),
    updatedAt: latestUpdatedAt,
  }
}

export async function loadConsolidatedFsData(
  clientId: string,
  fyId: string,
  businesses: Business[],
  fy: { endYear: number; closedBusinessIds?: string[] },
  fetchOne: (businessId: string) => Promise<FinancialStatementData>,
) {
  const businessesForFy = getBusinessesForFy(businesses, fy)

  if (businessesForFy.length < 2) {
    throw new Error('Consolidated statement requires at least two active businesses for this year.')
  }

  const records = await Promise.all(
    businessesForFy.map((business) => fetchOne(business.id)),
  )

  return mergeFinancialStatementData(clientId, fyId, records)
}
