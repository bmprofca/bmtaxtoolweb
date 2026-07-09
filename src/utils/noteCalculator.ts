import type {
  AdministrativeExpenseLine,
  CapitalAccountLine,
  DepreciationRow,
  FsNotes,
  ManualNoteLine,
  NoteBreakdowns,
  NoteSubAmounts,
  NoteValue,
  OtherShortTermBorrowingLine,
  PreviousYearDepreciationSummary,
} from '../types/fs'
import type { LoanRecord } from '../types/loan'
import type { BankAccountRecord } from '../types/bankAccount'
import type { LedgerRecord } from '../types/ledger'
import { computeStatements } from './fsCalculator'
import { buildNotesFromSubAmounts } from './noteSubFields'

export interface NoteCalcContext {
  notes: FsNotes
  noteBreakdowns: NoteBreakdowns
  noteSubAmounts: NoteSubAmounts
  previousYearSubAmounts: NoteSubAmounts | null
  depreciationSchedule: DepreciationRow[]
  previousYearDepreciation: PreviousYearDepreciationSummary
  loans: LoanRecord[]
  previousYearNotes: FsNotes | null
  fyStartYear: number
  fyEndYear: number
  computedLoans: { id: string; closingBalance: number; interestForYear: number; lender: string }[]
  previousYearComputedLoans: {
    id: string
    closingBalance: number
    interestForYear: number
    lender: string
  }[]
  administrativeExpenseLines: AdministrativeExpenseLine[]
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[]
  manualNoteLines: ManualNoteLine[]
  capitalAccountLines: CapitalAccountLine[]
  ledgers: LedgerRecord[]
  plAppropriationTotal: NoteValue
  bankAccounts: BankAccountRecord[]
  previousYearBankAccounts: BankAccountRecord[]
  cashAdjustment: NoteValue
}

export interface NoteCalcInfo {
  current: number
  previous: number
  isAuto: boolean
  formula: string
  editable: boolean
}

const NOTE_FORMULAS: Partial<Record<keyof FsNotes, string>> = {
  capitalAccount: 'Auto: Opening + Balance Profit + Add lines − Less lines',
  longTermBorrowings: 'Auto: Closing balance from Loan Repayment Schedule (or manual entry)',
  shortTermBorrowings:
    'Auto: Repayment schedule closing + CC/OD bank accounts + other borrowings',
  depreciationAmortization: 'Auto: Gross book value, depreciation and net WDV from Depreciation Schedule',
  financeCost: 'Auto: Schedule interest + manual borrowing interest + other finance cost',
  costOfGoodsSold: 'Auto: Opening + Purchase − Closing stock',
  cashAtBank: 'Auto: Current & Savings accounts from Bank Account tab (+ Cr balance)',
  cashInHand: 'Auto: Cash in Hand entry + Cash Flow Adjustment (Sources vs Application)',
}

export function buildEffectiveNotes(ctx: NoteCalcContext): FsNotes {
  const passOne = computeStatements(
    ctx.notes,
    ctx.depreciationSchedule,
    ctx.loans,
    ctx.fyStartYear,
    ctx.fyEndYear,
    ctx.previousYearDepreciation,
    ctx.plAppropriationTotal,
  )

  const passOneNotes = buildNotesFromSubAmounts(
    ctx.noteSubAmounts,
    ctx.previousYearSubAmounts,
    passOne,
    ctx.depreciationSchedule,
    ctx.previousYearDepreciation,
    ctx.loans,
    ctx.computedLoans,
    ctx.administrativeExpenseLines,
    ctx.previousYearComputedLoans,
    ctx.otherShortTermBorrowingLines,
    ctx.manualNoteLines,
    ctx.plAppropriationTotal,
    ctx.bankAccounts,
    ctx.previousYearBankAccounts,
    ctx.capitalAccountLines,
    ctx.ledgers,
    ctx.cashAdjustment,
  )

  const passTwo = computeStatements(
    passOneNotes,
    ctx.depreciationSchedule,
    ctx.loans,
    ctx.fyStartYear,
    ctx.fyEndYear,
    ctx.previousYearDepreciation,
    ctx.plAppropriationTotal,
  )

  return buildNotesFromSubAmounts(
    ctx.noteSubAmounts,
    ctx.previousYearSubAmounts,
    passTwo,
    ctx.depreciationSchedule,
    ctx.previousYearDepreciation,
    ctx.loans,
    ctx.computedLoans,
    ctx.administrativeExpenseLines,
    ctx.previousYearComputedLoans,
    ctx.otherShortTermBorrowingLines,
    ctx.manualNoteLines,
    ctx.plAppropriationTotal,
    ctx.bankAccounts,
    ctx.previousYearBankAccounts,
    ctx.capitalAccountLines,
    ctx.ledgers,
    ctx.cashAdjustment,
  )
}

export function getNoteCalcMap(
  ctx: NoteCalcContext,
  effectiveNotes: FsNotes,
): Record<keyof FsNotes, NoteCalcInfo> {
  const map = {} as Record<keyof FsNotes, NoteCalcInfo>

  for (const key of Object.keys(ctx.notes) as (keyof FsNotes)[]) {
    map[key] = {
      current: effectiveNotes[key].current,
      previous: effectiveNotes[key].previous,
      isAuto: true,
      formula: NOTE_FORMULAS[key] ?? 'Auto: Sum of sub-note lines',
      editable: false,
    }
  }

  return map
}

export function isNoteAutoCalculated(info: NoteCalcInfo) {
  return info.isAuto && !info.editable
}
