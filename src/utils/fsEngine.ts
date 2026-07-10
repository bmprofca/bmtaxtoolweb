import type {
  AdministrativeExpenseLine,
  CapitalAccountLine,
  ComputedStatements,
  DepreciationRow,
  FinancialStatementData,
  FsNotes,
  ManualNoteLine,
  NoteSubAmounts,
  NoteValue,
  OtherShortTermBorrowingLine,
  PreviousYearDepreciationSummary,
  StatementLine,
} from '../types/fs'
import type { BankAccountRecord } from '../types/bankAccount'
import type { LoanRecord } from '../types/loan'
import type { LedgerRecord } from '../types/ledger'
import { computeStatements } from './fsCalculator'
import { buildEffectiveNotes, type NoteCalcContext } from './noteCalculator'
import {
  buildSubResolveContext,
  resolveNoteSubRows,
  type ResolvedSubRow,
} from './noteSubFields'
import { NOTE_FIELDS } from './fsDefaults'
import type { OpeningBalanceLocks } from './openingBalanceCarryForward'

export interface FsDerivedState {
  effectiveNotes: FsNotes
  computed: ComputedStatements
  noteSubRowsMap: Record<keyof FsNotes, ResolvedSubRow[]>
}

export function buildFsDerivedState(params: {
  noteCalcContext: NoteCalcContext
  noteSubAmounts: NoteSubAmounts
  previousYearSubAmounts: NoteSubAmounts | null
  depreciationSchedule: DepreciationRow[]
  previousYearDepreciation: PreviousYearDepreciationSummary
  loans: LoanRecord[]
  computedLoans: { id: string; closingBalance: number; interestForYear: number; lender: string }[]
  administrativeExpenseLines: AdministrativeExpenseLine[]
  previousYearComputedLoans: {
    id: string
    closingBalance: number
    interestForYear: number
    lender: string
  }[]
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[]
  manualNoteLines: ManualNoteLine[]
  plAppropriationTotal: NoteValue
  bankAccounts: BankAccountRecord[]
  previousYearBankAccounts: BankAccountRecord[]
  capitalAccountLines: CapitalAccountLine[]
  ledgers: LedgerRecord[]
  openingBalanceLocks: OpeningBalanceLocks | null
  cashAdjustment: NoteValue
  fyStartYear: number
  fyEndYear: number
}): FsDerivedState {
  const effectiveNotes = buildEffectiveNotes(params.noteCalcContext)
  const computed = computeStatements(
    effectiveNotes,
    params.depreciationSchedule,
    params.loans,
    params.fyStartYear,
    params.fyEndYear,
    params.previousYearDepreciation,
    params.plAppropriationTotal,
  )

  const subResolveContext = buildSubResolveContext(
    params.noteSubAmounts,
    params.previousYearSubAmounts,
    computed,
    params.depreciationSchedule,
    params.previousYearDepreciation,
    params.loans,
    params.computedLoans,
    params.administrativeExpenseLines,
    params.previousYearComputedLoans,
    params.otherShortTermBorrowingLines,
    params.manualNoteLines,
    params.plAppropriationTotal,
    params.bankAccounts,
    params.previousYearBankAccounts,
    params.capitalAccountLines,
    params.ledgers,
    params.openingBalanceLocks,
    params.cashAdjustment,
  )

  const noteSubRowsMap = {} as Record<keyof FsNotes, ResolvedSubRow[]>
  for (const field of NOTE_FIELDS) {
    const noteKey = field.key
    noteSubRowsMap[noteKey] = resolveNoteSubRows(noteKey, subResolveContext)
  }

  return { effectiveNotes, computed, noteSubRowsMap }
}

function mergeNoteValuePrevious(current: NoteValue, priorCurrent: number): NoteValue {
  return {
    current: current.current,
    previous: priorCurrent,
  }
}

function mergeStatementLinesPrevious(
  currentLines: StatementLine[],
  priorLines: StatementLine[],
): StatementLine[] {
  const priorByKey = new Map<string, StatementLine>()
  for (const line of priorLines) {
    const key = line.rowId || line.label
    priorByKey.set(key, line)
  }

  return currentLines.map((line) => {
    const key = line.rowId || line.label
    const prior = priorByKey.get(key)
    if (!prior || line.isHeader || line.isSubHeader || line.blankAmounts) {
      return line
    }
    return {
      ...line,
      previous: prior.current,
    }
  })
}

function mergeSubRowsForComparative(
  currentRows: ResolvedSubRow[],
  priorRows: ResolvedSubRow[],
): ResolvedSubRow[] {
  const priorById = new Map(priorRows.map((row) => [row.id, row]))
  const seen = new Set<string>()
  const merged: ResolvedSubRow[] = []

  for (const row of currentRows) {
    seen.add(row.id)
    const prior = priorById.get(row.id)
    merged.push({
      ...row,
      previous: prior?.current ?? row.previous,
    })
  }

  for (const prior of priorRows) {
    if (seen.has(prior.id)) {
      continue
    }
    if (prior.kind === 'header') {
      merged.push({ ...prior, current: 0, previous: 0 })
      continue
    }
    merged.push({
      ...prior,
      current: 0,
      previous: prior.current,
    })
  }

  return merged
}

/** Overlay prior FY current-year figures into the comparative previous column. */
export function mergeComparativeDerivedState(
  current: FsDerivedState,
  priorSnapshot: FsDerivedState | null,
): FsDerivedState {
  if (!priorSnapshot) {
    return current
  }

  const effectiveNotes = { ...current.effectiveNotes }
  for (const field of NOTE_FIELDS) {
    const noteKey = field.key
    effectiveNotes[noteKey] = mergeNoteValuePrevious(
      current.effectiveNotes[noteKey],
      priorSnapshot.effectiveNotes[noteKey].current,
    )
  }

  const noteSubRowsMap = {} as Record<keyof FsNotes, ResolvedSubRow[]>
  for (const field of NOTE_FIELDS) {
    const noteKey = field.key
    noteSubRowsMap[noteKey] = mergeSubRowsForComparative(
      current.noteSubRowsMap[noteKey] ?? [],
      priorSnapshot.noteSubRowsMap[noteKey] ?? [],
    )
  }

  const computed: ComputedStatements = {
    balanceSheet: mergeStatementLinesPrevious(
      current.computed.balanceSheet,
      priorSnapshot.computed.balanceSheet,
    ),
    profitAndLoss: mergeStatementLinesPrevious(
      current.computed.profitAndLoss,
      priorSnapshot.computed.profitAndLoss,
    ),
    totalDepreciation: mergeNoteValuePrevious(
      current.computed.totalDepreciation,
      priorSnapshot.computed.totalDepreciation.current,
    ),
    totalLoanClosing: mergeNoteValuePrevious(
      current.computed.totalLoanClosing,
      priorSnapshot.computed.totalLoanClosing.current,
    ),
    longTermClosing: mergeNoteValuePrevious(
      current.computed.longTermClosing,
      priorSnapshot.computed.longTermClosing.current,
    ),
    shortTermClosing: mergeNoteValuePrevious(
      current.computed.shortTermClosing,
      priorSnapshot.computed.shortTermClosing.current,
    ),
    loanInterest: mergeNoteValuePrevious(
      current.computed.loanInterest,
      priorSnapshot.computed.loanInterest.current,
    ),
  }

  return { effectiveNotes, computed, noteSubRowsMap }
}

/** Fingerprint only editable payload slices — avoids stringifying the full FS blob. */
export function fsDataFingerprint(data: FinancialStatementData): string {
  return JSON.stringify({
    notes: data.notes,
    noteBreakdowns: data.noteBreakdowns,
    noteSubAmounts: data.noteSubAmounts,
    loans: data.loans,
    depreciationSchedule: data.depreciationSchedule,
    previousYearDepreciation: data.previousYearDepreciation,
    bankAccounts: data.bankAccounts,
    gstReco: data.gstReco,
    udinDetails: data.udinDetails,
    administrativeExpenseLines: data.administrativeExpenseLines,
    otherShortTermBorrowingLines: data.otherShortTermBorrowingLines,
    manualNoteLines: data.manualNoteLines,
    capitalAccountLines: data.capitalAccountLines,
    plAppropriationLines: data.plAppropriationLines,
    plAppropriationAmounts: data.plAppropriationAmounts,
    cashAdjustment: data.cashAdjustment,
    finalizationInfo: data.finalizationInfo,
  })
}
