import type { DepreciationRow, AssetDepreciationHistoryRow, PreviousYearDepreciationSummary } from '../types/fs'
import type { LedgerRecord } from '../types/ledger'
import { createDepreciationRow } from './fsDefaults'
import { recalcDepreciationRow, isPlaceholderDepreciationRow } from './depreciation'
import {
  getLedgerById,
  getLedgersForGroup,
  normalizeLedgerSign,
} from './ledgerUtils'

export const FIXED_ASSET_LEDGER_GROUP = 'depreciationAmortization' as const

export function getFixedAssetLedgers(ledgers: LedgerRecord[]): LedgerRecord[] {
  return getLedgersForGroup(ledgers, FIXED_ASSET_LEDGER_GROUP).filter(
    (ledger) => normalizeLedgerSign(ledger.sign) === 'add',
  )
}

export function getScheduleLedgerIds(schedule: DepreciationRow[]): Set<string> {
  return new Set(schedule.map((row) => row.ledgerId).filter(Boolean) as string[])
}

export function getAvailableFixedAssetLedgers(
  schedule: DepreciationRow[],
  ledgers: LedgerRecord[],
): LedgerRecord[] {
  const usedIds = getScheduleLedgerIds(schedule)
  return getFixedAssetLedgers(ledgers).filter((ledger) => !usedIds.has(ledger.id))
}

export function mergeDepreciationScheduleLedgerNames(
  schedule: DepreciationRow[],
  ledgers: LedgerRecord[],
): DepreciationRow[] {
  return schedule.map((row) => {
    if (!row.ledgerId) {
      return row
    }

    const ledger = getLedgerById(ledgers, row.ledgerId)
    if (!ledger || ledger.group !== FIXED_ASSET_LEDGER_GROUP) {
      return row
    }

    return recalcDepreciationRow({
      ...row,
      assetName: ledger.name,
    })
  })
}

export function createDepreciationRowFromLedger(
  ledger: LedgerRecord,
  purchaseDate = '',
): DepreciationRow {
  return recalcDepreciationRow({
    ...createDepreciationRow(),
    ledgerId: ledger.id,
    assetName: ledger.name,
    purchaseDate,
  })
}

export function isScheduleEffectivelyEmpty(schedule: DepreciationRow[]): boolean {
  return schedule.filter((row) => !isPlaceholderDepreciationRow(row)).length === 0
}

/** Add a row for each fixed asset ledger when the schedule has no real assets yet. */
export function autoPopulateDepreciationFromLedgers(
  schedule: DepreciationRow[],
  ledgers: LedgerRecord[],
  priorClosingsByLedgerId: Map<string, number> = new Map(),
): DepreciationRow[] {
  if (!isScheduleEffectivelyEmpty(schedule)) {
    return schedule
  }

  const fixedAssetLedgers = getFixedAssetLedgers(ledgers)
  if (fixedAssetLedgers.length === 0) {
    return schedule
  }

  return fixedAssetLedgers.map((ledger) => {
    const priorClosing = priorClosingsByLedgerId.get(ledger.id) ?? 0
    return recalcDepreciationRow({
      ...createDepreciationRowFromLedger(ledger),
      openingWdv: priorClosing > 0 ? priorClosing : 0,
    })
  })
}

export function sumDepreciationHistoryForFy(
  history: AssetDepreciationHistoryRow[],
  fyId: string,
): PreviousYearDepreciationSummary {
  const rows = history.filter((row) => row.fyId === fyId)
  return {
    openingWdv: rows.reduce((total, row) => total + row.openingWdv, 0),
    additionBeforeOct3: rows.reduce((total, row) => total + row.additionBeforeOct3, 0),
    additionOnAfterOct3: rows.reduce((total, row) => total + row.additionOnAfterOct3, 0),
    assetDeletion: rows.reduce((total, row) => total + row.assetDeletion, 0),
    depreciation: rows.reduce((total, row) => total + row.depreciationCharged, 0),
    closingWdv: rows.reduce((total, row) => total + row.closingWdv, 0),
  }
}

export function historyEntryToDepreciationRow(entry: AssetDepreciationHistoryRow): DepreciationRow {
  const calc = recalcDepreciationRow({
    id: `hist_${entry.id}`,
    ledgerId: entry.ledgerId,
    assetName: entry.assetName,
    purchaseDate: entry.purchaseDate,
    rate: entry.rate,
    openingWdv: entry.openingWdv,
    additionBeforeOct3: entry.additionBeforeOct3,
    additionOnAfterOct3: entry.additionOnAfterOct3,
    assetDeletion: entry.assetDeletion,
    depreciation: entry.depreciationCharged,
    closingWdv: entry.closingWdv,
  })
  return {
    ...calc,
    depreciation: entry.depreciationCharged > 0 ? entry.depreciationCharged : calc.depreciation,
    closingWdv: entry.closingWdv > 0 ? entry.closingWdv : calc.closingWdv,
  }
}

/** Merge prior schedule rows with per-asset history for the prior FY (history fills gaps). */
export function expandPriorScheduleWithHistory(
  priorSchedule: DepreciationRow[],
  history: AssetDepreciationHistoryRow[],
  priorFyId: string,
): DepreciationRow[] {
  const merged = [...priorSchedule]
  const usedLedgerIds = new Set(
    priorSchedule.map((row) => row.ledgerId).filter(Boolean) as string[],
  )
  const usedIds = new Set(priorSchedule.map((row) => row.id))

  for (const entry of history) {
    if (entry.fyId !== priorFyId || entry.closingWdv <= 0) {
      continue
    }
    if (entry.ledgerId && usedLedgerIds.has(entry.ledgerId)) {
      continue
    }
    if (usedIds.has(entry.id)) {
      continue
    }

    const row = historyEntryToDepreciationRow(entry)
    merged.push(row)
    usedIds.add(row.id)
    if (row.ledgerId) {
      usedLedgerIds.add(row.ledgerId)
    }
  }

  return merged
}

export function getLedgersForAssetSelect(
  schedule: DepreciationRow[],
  rowIndex: number,
  ledgers: LedgerRecord[],
): LedgerRecord[] {
  const usedIds = getScheduleLedgerIds(schedule)
  const currentId = schedule[rowIndex]?.ledgerId
  if (currentId) {
    usedIds.delete(currentId)
  }
  return getFixedAssetLedgers(ledgers).filter((ledger) => !usedIds.has(ledger.id))
}

export function updateDepreciationRowLedger(
  schedule: DepreciationRow[],
  index: number,
  ledgerId: string,
  ledgers: LedgerRecord[],
  purchaseDate = '',
): DepreciationRow[] {
  const ledger = getLedgerById(ledgers, ledgerId)
  if (!ledger || ledger.group !== FIXED_ASSET_LEDGER_GROUP) {
    return schedule
  }

  return schedule.map((row, rowIndex) =>
    rowIndex === index
      ? recalcDepreciationRow({
          ...row,
          ledgerId: ledger.id,
          assetName: ledger.name,
          purchaseDate: purchaseDate || (row.ledgerId === ledger.id ? row.purchaseDate || '' : ''),
        })
      : row,
  )
}
