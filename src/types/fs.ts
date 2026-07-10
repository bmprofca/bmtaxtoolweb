export interface NoteBreakdownRow {
  id: string
  particular: string
  amount: number
}

export interface NoteBreakdownCell {
  current: NoteBreakdownRow[]
  previous: NoteBreakdownRow[]
}

export type NoteBreakdowns = Partial<Record<keyof FsNotes, NoteBreakdownCell>>

export type NoteSubCell = { current: number; previous: number }

export type NoteSubAmounts = Partial<Record<keyof FsNotes, Record<string, NoteSubCell>>>

export interface AdministrativeExpenseLine {
  id: string
  categoryId: string
}

export interface OtherShortTermBorrowingLine {
  id: string
  typeId: string
}

export interface ManualNoteLine {
  id: string
  noteKey: string
  typeId: string
}

export interface CapitalAccountLine {
  id: string
  sign: 'add' | 'less'
  typeId: string
}

export interface CogsExtraLine {
  id: string
  sign: 'add' | 'less'
  typeId: string
}

export interface PlAppropriationLine {
  id: string
  categoryId: string
}

export interface NoteValue {
  current: number
  previous: number
}

export interface FsNotes {
  capitalAccount: NoteValue
  longTermBorrowings: NoteValue
  otherLongTermLiabilities: NoteValue
  longTermProvisions: NoteValue
  shortTermBorrowings: NoteValue
  tradePayables: NoteValue
  otherCurrentLiabilities: NoteValue
  shortTermProvision: NoteValue
  depreciationAmortization: NoteValue
  nonCurrentInvestments: NoteValue
  longTermLoansAdvances: NoteValue
  otherNonCurrentAssets: NoteValue
  currentInvestments: NoteValue
  inventoriesTradeReceivables: NoteValue
  balancesRevenueAuthority: NoteValue
  shortTermLoansAdvances: NoteValue
  cashAtBank: NoteValue
  cashInHand: NoteValue
  revenueFromOperations: NoteValue
  otherIncome: NoteValue
  costOfGoodsSold: NoteValue
  employeeBenefitExpenses: NoteValue
  otherAdministrativeExpenses: NoteValue
  financeCost: NoteValue
}

export interface DepreciationRow {
  id: string
  ledgerId?: string
  assetName: string
  purchaseDate?: string
  rate: number
  openingWdv: number
  additionBeforeOct3: number
  additionOnAfterOct3: number
  assetDeletion: number
  depreciation: number
  closingWdv: number
}

export interface AssetDepreciationHistoryRow {
  id: string
  fyId: string
  fyLabel: string
  fyStartYear: number
  ledgerId: string
  assetName: string
  purchaseDate: string
  rate: number
  openingWdv: number
  additionBeforeOct3: number
  additionOnAfterOct3: number
  assetDeletion: number
  depreciationCharged: number
  closingWdv: number
}

export interface RepaymentRow {
  id: string
  lender: string
  openingBalance: number
  addition: number
  repayment: number
  closingBalance: number
}

export interface PreviousYearDepreciationSummary {
  openingWdv: number
  additionBeforeOct3: number
  additionOnAfterOct3: number
  assetDeletion: number
  depreciation: number
  closingWdv: number
}

export interface UdinDetails {
  enabled: boolean
  caProfileId: string
  udinNumber: string
  udinDate: string
  caPartnerName?: string
  caFirmName?: string
}

export interface FinalizationInfo {
  isFinalized: boolean
  isUnlocked: boolean
  finalizedAt: string
  unlockedAt: string
  lockToken: string
}

export interface CashAdjustment {
  current: number
  previous: number
}

export interface NotesData {
  notes: FsNotes
  noteSubAmounts: NoteSubAmounts
  noteBreakdowns: NoteBreakdowns
  administrativeExpenseLines: AdministrativeExpenseLine[]
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[]
  manualNoteLines: ManualNoteLine[]
  capitalAccountLines: CapitalAccountLine[]
  cogsExtraLines: CogsExtraLine[]
  plAppropriationLines: PlAppropriationLine[]
  plAppropriationAmounts: Record<string, NoteSubCell>
  cashAdjustment: CashAdjustment
}

export interface NoteHistoryRow {
  id: string
  fyId: string
  fyLabel: string
  fyStartYear: number
  snapshot: NotesData
  createdAt?: string
  updatedAt?: string
}

import type { LoanRecord } from './loan'
import type { GstRecoStatement } from './gst'
import type { BankAccountRecord } from './bankAccount'

export interface FinancialStatementData {
  clientId: string
  fyId: string
  businessId: string
  notes: FsNotes
  noteBreakdowns: NoteBreakdowns
  noteSubAmounts: NoteSubAmounts
  administrativeExpenseLines: AdministrativeExpenseLine[]
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[]
  manualNoteLines: ManualNoteLine[]
  capitalAccountLines: CapitalAccountLine[]
  cogsExtraLines: CogsExtraLine[]
  plAppropriationLines: PlAppropriationLine[]
  plAppropriationAmounts: Record<string, NoteSubCell>
  depreciationSchedule: DepreciationRow[]
  previousYearDepreciation: PreviousYearDepreciationSummary
  loans: LoanRecord[]
  bankAccounts: BankAccountRecord[]
  gstReco: GstRecoStatement
  cashAdjustment?: CashAdjustment
  udinDetails?: UdinDetails
  finalizationInfo?: FinalizationInfo
  unlockConfirmationCode?: string
  /** @deprecated migrated to loans */
  repaymentSchedule?: RepaymentRow[]
  /** Set when the user explicitly saves; used to lock editing until unlock code is entered */
  savedAt?: string | null
  updatedAt: string
  statementSnapshot?: StatementSnapshot
}

export interface StatementFySummary {
  sourcesTotalCurrent: number
  sourcesTotalPrevious: number
  applicationTotalCurrent: number
  applicationTotalPrevious: number
  netProfitCurrent: number
  netProfitPrevious: number
  grossProfitCurrent: number
  grossProfitPrevious: number
  totalIncomeCurrent: number
  totalIncomePrevious: number
  totalExpensesCurrent: number
  totalExpensesPrevious: number
  cashAdjustmentCurrent: number
  cashAdjustmentPrevious: number
  sourcesApplicationDiffCurrent: number
  sourcesApplicationDiffPrevious: number
}

export interface StatementSnapshot {
  balanceSheetLines: StatementLine[]
  profitAndLossLines: StatementLine[]
  summary: StatementFySummary
}

export interface StatementHistoryRow {
  id: string
  fyId: string
  fyLabel: string
  fyStartYear: number
  snapshot: StatementSnapshot
  createdAt?: string
  updatedAt?: string
}

export interface StatementLine {
  label: string
  current: number
  previous: number
  isTotal?: boolean
  isHeader?: boolean
  isGrandTotal?: boolean
  isSubHeader?: boolean
  isSubLine?: boolean
  indent?: number
  noteNo?: string
  noteKey?: keyof FsNotes
  noteSubId?: string
  blankAmounts?: boolean
  isSpacer?: boolean
  rowId?: string
}

export interface ComputedStatements {
  balanceSheet: StatementLine[]
  profitAndLoss: StatementLine[]
  totalDepreciation: NoteValue
  totalLoanClosing: NoteValue
  longTermClosing: NoteValue
  shortTermClosing: NoteValue
  loanInterest: NoteValue
}
