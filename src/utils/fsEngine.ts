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
