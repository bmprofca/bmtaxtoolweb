import type { FinancialYear } from '../types'
import type {
  AdministrativeExpenseLine,
  CapitalAccountLine,
  CashAdjustment,
  DepreciationRow,
  FinancialStatementData,
  FsNotes,
  ManualNoteLine,
  NoteBreakdowns,
  NoteSubAmounts,
  NoteSubCell,
  NoteValue,
  OtherShortTermBorrowingLine,
  PreviousYearDepreciationSummary,
} from '../types/fs'
import type { BankAccountRecord } from '../types/bankAccount'
import type { LoanRecord } from '../types/loan'
import type { LedgerRecord } from '../types/ledger'
import { normalizeDepreciationSchedule } from './depreciation'
import {
  buildComparativeCashAdjustment,
  migrateNoteBreakdowns,
  migrateNotes,
  normalizePreviousYearDepreciation,
  notesWithPreviousFromPriorFy,
} from './fsDefaults'
import { buildFsDerivedState, mergeComparativeDerivedState, type FsDerivedState } from './fsEngine'
import { findPreviousFinancialYear } from './financialYear'
import { computeStatements } from './fsCalculator'
import { buildEffectiveNotes } from './noteCalculator'
import { normalizeBankAccounts } from './bankAccount'
import {
  migrateCapitalAccountSubAmounts,
  normalizeCapitalAccountLines,
} from './capitalAccountLineConfig'
import { normalizeLoans, recomputeLoansForFy } from './loanCalculator'
import {
  migrateAdminExpenseSubAmounts,
  migrateManualNoteLineSubAmounts,
  migrateOtherShortTermSubAmounts,
  normalizeAdministrativeExpenseLines,
  normalizeManualNoteLines,
  normalizeNoteSubAmounts,
  normalizeOtherShortTermBorrowingLines,
  buildSubResolveContext,
  enrichPreviousYearSubAmountsWithClosings,
} from './noteSubFields'
import {
  migratePlAppropriationAmounts,
  normalizePlAppropriationLines,
  sumPlAppropriation,
} from './plAppropriation'

export interface PreparedYearFs {
  notes: FsNotes
  noteBreakdowns: NoteBreakdowns
  noteSubAmounts: NoteSubAmounts
  loans: LoanRecord[]
  bankAccounts: BankAccountRecord[]
  administrativeExpenseLines: AdministrativeExpenseLine[]
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[]
  manualNoteLines: ManualNoteLine[]
  capitalAccountLines: CapitalAccountLine[]
  plAppropriationLines: ReturnType<typeof normalizePlAppropriationLines>
  plAppropriationAmounts: Record<string, NoteSubCell>
  depreciationSchedule: DepreciationRow[]
  previousYearDepreciation: PreviousYearDepreciationSummary
  cashAdjustment: CashAdjustment
  fyStartYear: number
  fyEndYear: number
  computedLoansPayload: {
    id: string
    closingBalance: number
    interestForYear: number
    lender: string
  }[]
  plAppropriationTotal: NoteValue
}

export interface YearDisplaySnapshotChain {
  financialYears: FinancialYear[]
  ledgers: LedgerRecord[]
  fetchFs: (fyId: string, fy: FinancialYear) => Promise<FinancialStatementData | null>
  displayCache: Map<string, FsDerivedState | null>
  preparedCache: Map<string, PreparedYearFs | null>
  rawFsCache: Map<string, FinancialStatementData | null>
}

function normalizeCashAdjustment(value?: Partial<CashAdjustment> | null): CashAdjustment {
  return {
    current: Number(value?.current) || 0,
    previous: Number(value?.previous) || 0,
  }
}

export function prepareYearFsData(
  rawFs: FinancialStatementData,
  fyStartYear: number,
  fyEndYear: number,
  ledgers: LedgerRecord[],
): PreparedYearFs {
  const bankAccounts = normalizeBankAccounts(rawFs.bankAccounts)
  const loans = normalizeLoans(rawFs.loans, rawFs.repaymentSchedule, fyStartYear, fyEndYear)
  const administrativeExpenseLines = normalizeAdministrativeExpenseLines(
    rawFs.administrativeExpenseLines,
    rawFs.noteSubAmounts,
  )
  const otherShortTermBorrowingLines = normalizeOtherShortTermBorrowingLines(
    rawFs.otherShortTermBorrowingLines,
    rawFs.noteSubAmounts,
  )
  const manualNoteLines = normalizeManualNoteLines(rawFs.manualNoteLines, rawFs.noteSubAmounts)
  const capitalAccountLines = normalizeCapitalAccountLines(
    rawFs.capitalAccountLines,
    rawFs.noteSubAmounts,
  )
  const plAppropriationLines = normalizePlAppropriationLines(rawFs.plAppropriationLines)
  const plAppropriationAmounts = migratePlAppropriationAmounts(
    plAppropriationLines,
    rawFs.plAppropriationAmounts ?? {},
  )
  const notes = migrateNotes(rawFs.notes as Parameters<typeof migrateNotes>[0])
  const noteBreakdowns = migrateNoteBreakdowns(rawFs.noteBreakdowns)

  let noteSubAmounts = normalizeNoteSubAmounts(
    rawFs.noteSubAmounts,
    noteBreakdowns,
    loans,
    administrativeExpenseLines,
    otherShortTermBorrowingLines,
    manualNoteLines,
    bankAccounts,
    capitalAccountLines,
    ledgers,
  )
  noteSubAmounts = migrateAdminExpenseSubAmounts(administrativeExpenseLines, noteSubAmounts)
  noteSubAmounts = migrateOtherShortTermSubAmounts(otherShortTermBorrowingLines, noteSubAmounts)
  noteSubAmounts = migrateManualNoteLineSubAmounts(manualNoteLines, noteSubAmounts)
  noteSubAmounts = migrateCapitalAccountSubAmounts(capitalAccountLines, noteSubAmounts)

  const depreciationSchedule = normalizeDepreciationSchedule(rawFs.depreciationSchedule || [])
  const previousYearDepreciation = normalizePreviousYearDepreciation(rawFs.previousYearDepreciation)
  const computedLoansPayload = recomputeLoansForFy(loans, fyStartYear, fyEndYear).map((loan) => ({
    id: loan.id,
    closingBalance: loan.closingBalance,
    interestForYear: loan.interestForYear,
    lender: loan.lender,
  }))
  const plAppropriationTotal = sumPlAppropriation(plAppropriationLines, plAppropriationAmounts, null)

  return {
    notes,
    noteBreakdowns,
    noteSubAmounts,
    loans,
    bankAccounts,
    administrativeExpenseLines,
    otherShortTermBorrowingLines,
    manualNoteLines,
    capitalAccountLines,
    plAppropriationLines,
    plAppropriationAmounts,
    depreciationSchedule,
    previousYearDepreciation,
    cashAdjustment: normalizeCashAdjustment(rawFs.cashAdjustment),
    fyStartYear,
    fyEndYear,
    computedLoansPayload,
    plAppropriationTotal,
  }
}

function buildPreviousYearComputedLoans(priorPrepared: PreparedYearFs) {
  return recomputeLoansForFy(
    priorPrepared.loans,
    priorPrepared.fyStartYear,
    priorPrepared.fyEndYear,
  ).map((loan) => ({
    id: loan.id,
    closingBalance: loan.closingBalance,
    interestForYear: loan.interestForYear,
    lender: loan.lender,
  }))
}

function enrichPreparedYearSubAmounts(
  prepared: PreparedYearFs,
  ledgers: LedgerRecord[],
): NoteSubAmounts {
  const effectiveNotes = buildEffectiveNotes({
    notes: prepared.notes,
    noteBreakdowns: prepared.noteBreakdowns,
    noteSubAmounts: prepared.noteSubAmounts,
    previousYearSubAmounts: null,
    depreciationSchedule: prepared.depreciationSchedule,
    previousYearDepreciation: prepared.previousYearDepreciation,
    loans: prepared.loans,
    previousYearNotes: null,
    fyStartYear: prepared.fyStartYear,
    fyEndYear: prepared.fyEndYear,
    computedLoans: prepared.computedLoansPayload,
    previousYearComputedLoans: [],
    administrativeExpenseLines: prepared.administrativeExpenseLines,
    otherShortTermBorrowingLines: prepared.otherShortTermBorrowingLines,
    manualNoteLines: prepared.manualNoteLines,
    capitalAccountLines: prepared.capitalAccountLines,
    ledgers,
    plAppropriationTotal: prepared.plAppropriationTotal,
    bankAccounts: prepared.bankAccounts,
    previousYearBankAccounts: [],
    cashAdjustment: prepared.cashAdjustment,
  })
  const computed = computeStatements(
    effectiveNotes,
    prepared.depreciationSchedule,
    prepared.loans,
    prepared.fyStartYear,
    prepared.fyEndYear,
    prepared.previousYearDepreciation,
    prepared.plAppropriationTotal,
  )

  return enrichPreviousYearSubAmountsWithClosings(
    prepared.noteSubAmounts,
    buildSubResolveContext(
      prepared.noteSubAmounts,
      null,
      computed,
      prepared.depreciationSchedule,
      prepared.previousYearDepreciation,
      prepared.loans,
      prepared.computedLoansPayload,
      prepared.administrativeExpenseLines,
      [],
      prepared.otherShortTermBorrowingLines,
      prepared.manualNoteLines,
      prepared.plAppropriationTotal,
      prepared.bankAccounts,
      [],
      prepared.capitalAccountLines,
      ledgers,
      null,
      prepared.cashAdjustment,
    ),
  )
}

export function buildFsDerivedFromPrepared(
  prepared: PreparedYearFs,
  priorPrepared: PreparedYearFs | null,
  ledgers: LedgerRecord[],
): FsDerivedState {
  const previousYearComputedLoans = priorPrepared ? buildPreviousYearComputedLoans(priorPrepared) : []
  const previousYearSubAmounts = priorPrepared
    ? enrichPreparedYearSubAmounts(priorPrepared, ledgers)
    : null
  const comparativeCashAdjustment = buildComparativeCashAdjustment(
    prepared.cashAdjustment,
    priorPrepared?.cashAdjustment ?? null,
  )

  return buildFsDerivedState({
    noteCalcContext: {
      notes: notesWithPreviousFromPriorFy(prepared.notes, priorPrepared?.notes ?? null),
      noteBreakdowns: prepared.noteBreakdowns,
      noteSubAmounts: prepared.noteSubAmounts,
      previousYearSubAmounts,
      depreciationSchedule: prepared.depreciationSchedule,
      previousYearDepreciation: prepared.previousYearDepreciation,
      loans: prepared.loans,
      previousYearNotes: priorPrepared?.notes ?? null,
      fyStartYear: prepared.fyStartYear,
      fyEndYear: prepared.fyEndYear,
      computedLoans: prepared.computedLoansPayload,
      previousYearComputedLoans,
      administrativeExpenseLines: prepared.administrativeExpenseLines,
      otherShortTermBorrowingLines: prepared.otherShortTermBorrowingLines,
      manualNoteLines: prepared.manualNoteLines,
      capitalAccountLines: prepared.capitalAccountLines,
      ledgers,
      plAppropriationTotal: prepared.plAppropriationTotal,
      bankAccounts: prepared.bankAccounts,
      previousYearBankAccounts: priorPrepared?.bankAccounts ?? [],
      cashAdjustment: comparativeCashAdjustment,
    },
    noteSubAmounts: prepared.noteSubAmounts,
    previousYearSubAmounts,
    depreciationSchedule: prepared.depreciationSchedule,
    previousYearDepreciation: prepared.previousYearDepreciation,
    loans: prepared.loans,
    computedLoans: prepared.computedLoansPayload,
    administrativeExpenseLines: prepared.administrativeExpenseLines,
    previousYearComputedLoans,
    otherShortTermBorrowingLines: prepared.otherShortTermBorrowingLines,
    manualNoteLines: prepared.manualNoteLines,
    plAppropriationTotal: prepared.plAppropriationTotal,
    bankAccounts: prepared.bankAccounts,
    previousYearBankAccounts: priorPrepared?.bankAccounts ?? [],
    capitalAccountLines: prepared.capitalAccountLines,
    ledgers,
    openingBalanceLocks: null,
    cashAdjustment: comparativeCashAdjustment,
    fyStartYear: prepared.fyStartYear,
    fyEndYear: prepared.fyEndYear,
  })
}

async function fetchRawFsForYear(
  fyId: string,
  fy: FinancialYear,
  chain: YearDisplaySnapshotChain,
): Promise<FinancialStatementData | null> {
  if (chain.rawFsCache.has(fyId)) {
    return chain.rawFsCache.get(fyId) ?? null
  }
  const rawFs = await chain.fetchFs(fyId, fy)
  chain.rawFsCache.set(fyId, rawFs)
  return rawFs
}

export async function resolvePreparedYearFs(
  fyId: string,
  chain: YearDisplaySnapshotChain,
): Promise<PreparedYearFs | null> {
  if (chain.preparedCache.has(fyId)) {
    return chain.preparedCache.get(fyId) ?? null
  }

  const fy = chain.financialYears.find((item) => item.id === fyId)
  if (!fy) {
    chain.preparedCache.set(fyId, null)
    return null
  }

  const rawFs = await fetchRawFsForYear(fyId, fy, chain)
  if (!rawFs) {
    chain.preparedCache.set(fyId, null)
    return null
  }

  const prepared = prepareYearFsData(rawFs, fy.startYear, fy.endYear, chain.ledgers)
  chain.preparedCache.set(fyId, prepared)
  return prepared
}

/**
 * Build the display snapshot for a FY as the user would see it when that year is current.
 * Recurses through the full prior-year chain so comparative columns stay consistent at any depth.
 */
export async function resolveYearDisplaySnapshot(
  fyId: string,
  chain: YearDisplaySnapshotChain,
): Promise<FsDerivedState | null> {
  if (chain.displayCache.has(fyId)) {
    return chain.displayCache.get(fyId) ?? null
  }

  const fy = chain.financialYears.find((item) => item.id === fyId)
  if (!fy) {
    chain.displayCache.set(fyId, null)
    return null
  }

  const prepared = await resolvePreparedYearFs(fyId, chain)
  if (!prepared) {
    chain.displayCache.set(fyId, null)
    return null
  }

  const priorFy = findPreviousFinancialYear(chain.financialYears, fyId)
  let priorPrepared: PreparedYearFs | null = null
  let priorDisplay: FsDerivedState | null = null

  if (priorFy) {
    priorDisplay = await resolveYearDisplaySnapshot(priorFy.id, chain)
    priorPrepared = await resolvePreparedYearFs(priorFy.id, chain)
  }

  const rawDerived = buildFsDerivedFromPrepared(prepared, priorPrepared, chain.ledgers)
  const display = mergeComparativeDerivedState(rawDerived, priorDisplay)
  chain.displayCache.set(fyId, display)
  return display
}
