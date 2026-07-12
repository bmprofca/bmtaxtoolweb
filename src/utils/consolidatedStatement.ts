import type { Business } from '../types'
import type { FinancialStatementData, FsNotes, StatementLine } from '../types/fs'
import type { LedgerRecord } from '../types/ledger'
import { buildBalanceSheetLines } from './balanceSheetBuilder'
import { buildFsDerivedFromPrepared, prepareYearFsData } from './yearDisplaySnapshot'
import type { FsDerivedState } from './fsEngine'
import type { ResolvedSubRow } from './noteSubFields'

export interface ConsolidatedBusinessColumn {
  id: string
  name: string
}

export function consolidatedBusinessColumnsFromBusinesses(
  businesses: Business[],
): ConsolidatedBusinessColumn[] {
  return businesses.map((business) => ({
    id: business.id,
    name: business.name?.trim() || 'Business',
  }))
}

export function buildFsDerivedForFsRecord(
  rawFs: FinancialStatementData,
  fy: { startYear: number; endYear: number },
  ledgers: LedgerRecord[],
): FsDerivedState {
  const prepared = prepareYearFsData(rawFs, fy.startYear, fy.endYear, ledgers)
  return buildFsDerivedFromPrepared(prepared, null, ledgers)
}

export function buildBalanceSheetLinesForFsRecord(
  rawFs: FinancialStatementData,
  fy: { startYear: number; endYear: number },
  ledgers: LedgerRecord[],
): StatementLine[] {
  const derived = buildFsDerivedForFsRecord(rawFs, fy, ledgers)

  return buildBalanceSheetLines({
    notes: derived.effectiveNotes,
    tradePayableRows: derived.noteSubRowsMap.tradePayables,
    inventoryRows: derived.noteSubRowsMap.inventoriesTradeReceivables,
    fixedAssetRows: derived.noteSubRowsMap.depreciationAmortization,
  })
}

export function buildProfitLossLinesForFsRecord(
  rawFs: FinancialStatementData,
  fy: { startYear: number; endYear: number },
  ledgers: LedgerRecord[],
): StatementLine[] {
  const derived = buildFsDerivedForFsRecord(rawFs, fy, ledgers)
  return derived.computed.profitAndLoss
}

function findMatchingBusinessLine(
  templateLine: StatementLine,
  index: number,
  businessLines: StatementLine[],
): StatementLine | undefined {
  if (templateLine.rowId) {
    const byRowId = businessLines.find((line) => line.rowId === templateLine.rowId)
    if (byRowId) {
      return byRowId
    }
  }

  if (businessLines[index]?.label === templateLine.label) {
    return businessLines[index]
  }

  return businessLines.find(
    (line) =>
      line.label === templateLine.label &&
      (line.noteNo || '') === (templateLine.noteNo || '') &&
      Boolean(line.isTotal) === Boolean(templateLine.isTotal) &&
      Boolean(line.isGrandTotal) === Boolean(templateLine.isGrandTotal),
  )
}

export function buildConsolidatedStatementDisplayLines(
  templateLines: StatementLine[],
  businesses: ConsolidatedBusinessColumn[],
  perBusinessLines: StatementLine[][],
): StatementLine[] {
  return templateLines.map((templateLine, index) => {
    if (templateLine.isHeader || templateLine.isSubHeader || templateLine.isSpacer) {
      return { ...templateLine }
    }

    const businessCurrentValues: Record<string, number> = {}
    for (let businessIndex = 0; businessIndex < businesses.length; businessIndex += 1) {
      const business = businesses[businessIndex]
      const businessLines = perBusinessLines[businessIndex] ?? []
      const match = findMatchingBusinessLine(templateLine, index, businessLines)
      businessCurrentValues[business.id] = templateLine.blankAmounts ? 0 : (match?.current ?? 0)
    }

    const total = Object.values(businessCurrentValues).reduce((sum, value) => sum + value, 0)

    return {
      ...templateLine,
      businessCurrentValues,
      current: templateLine.blankAmounts ? templateLine.current : total,
    }
  })
}

export function getConsolidatedNoteSubCurrent(
  perBusinessDerived: FsDerivedState[],
  noteKey: keyof FsNotes,
  subId: string,
  businessIndex: number,
): number {
  const subRow = perBusinessDerived[businessIndex]?.noteSubRowsMap[noteKey]?.find(
    (row) => row.id === subId,
  )
  return subRow?.current ?? 0
}

export function getConsolidatedNoteSubBusinessValues(
  perBusinessDerived: FsDerivedState[],
  businesses: ConsolidatedBusinessColumn[],
  noteKey: keyof FsNotes,
  sub: ResolvedSubRow,
): Record<string, number> {
  const values: Record<string, number> = {}
  for (let businessIndex = 0; businessIndex < businesses.length; businessIndex += 1) {
    values[businesses[businessIndex].id] = getConsolidatedNoteSubCurrent(
      perBusinessDerived,
      noteKey,
      sub.id,
      businessIndex,
    )
  }
  return values
}

/** @deprecated Use buildConsolidatedStatementDisplayLines */
export const buildConsolidatedBalanceSheetDisplayLines = buildConsolidatedStatementDisplayLines
