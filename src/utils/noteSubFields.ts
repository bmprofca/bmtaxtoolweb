import type {
  AdministrativeExpenseLine,
  CapitalAccountLine,
  CogsExtraLine,
  ComputedStatements,
  FsNotes,
  ManualNoteLine,
  NoteBreakdowns,
  NoteSubAmounts,
  NoteValue,
  OtherShortTermBorrowingLine,
} from '../types/fs'
import type { LoanRecord } from '../types/loan'
import type { BankAccountRecord } from '../types/bankAccount'
import type { OpeningBalanceLocks } from './openingBalanceCarryForward'
import { NOTE_OPENING_CARRY_RULES } from './openingBalanceCarryForward'
import { isNoteSubCurrentYearReadOnly } from './noteSubEditability'
import { migrateCapitalAccountSubAmounts } from './capitalAccountLineConfig'
import {
  bankAccountSubId,
  bankShortTermSubId,
  buildBankCashAtBankBalances,
  buildBankShortTermBorrowingBalances,
  formatBankAccountNoteLabel,
  formatBankShortTermBorrowingNoteLabel,
  getCashAtBankAccounts,
  getShortTermBorrowingBankAccounts,
} from './bankAccount'
import {
  adminExpenseSubId,
  normalizeAdminCategoryId,
} from './adminExpenseCategories'
import {
  manualShortTermInterestSubId,
  manualShortTermSubId,
  normalizeOtherShortTermBorrowingTypeId,
} from './otherShortTermBorrowingTypes'
import {
  MANUAL_NOTE_LINE_CONFIGS,
  MANUAL_NOTE_LINE_KEYS,
  isManualNoteLineKey,
  manualNoteLineSubId,
  normalizeManualNoteLineTypeId,
  type ManualNoteLineKey,
} from './manualNoteLineConfig'
import { capitalAccountLineSubId } from './capitalAccountLineConfig'
import { cogsExtraLineSubId, migrateCogsExtraSubAmounts } from './cogsExtraLineConfig'
import type { LedgerRecord } from '../types/ledger'
import {
  formatLedgerRowLabel,
  getLedgerById,
  isLedgerSubId,
  ledgerIdFromSubId,
} from './ledgerUtils'
import { calcBalanceProfit } from './plAppropriation'
import { sumDepreciationSchedule } from './depreciation'
import { NOTE_FIELDS } from './fsDefaults'

export type NoteSubKind = 'entry' | 'auto' | 'total' | 'less' | 'subtotal' | 'percent' | 'header'

export type NoteSubAutoKey =
  | 'net-profit'
  | 'balance-profit'
  | 'depreciation-total'
  | 'closing-wdv'
  | 'gross-wdv'
  | 'loan-long-closing'
  | 'loan-short-closing'
  | 'loan-interest'
  | 'bank-cash-closing'
  | 'bank-st-closing'
  | 'cash-flow-adjustment'
  | 'cogs-total'
  | 'gross-profit'
  | 'gross-profit-pct'
  | 'note-sum'
  | 'capital-closing'

export interface NoteSubFieldDef {
  id: string
  label: string
  kind: NoteSubKind
  autoKey?: NoteSubAutoKey
  sign?: 1 | -1
  loanType?: 'long-term' | 'short-term'
}

export interface ResolvedSubRow {
  id: string
  label: string
  kind: NoteSubKind
  current: number
  previous: number
  editable: boolean
  isAuto: boolean
  loanType?: 'long-term' | 'short-term'
}

const emptyCell = () => ({ current: 0, previous: 0 })

export const NOTE_SUB_TEMPLATES: Record<keyof FsNotes, NoteSubFieldDef[]> = {
  capitalAccount: [
    { id: 'opening-balance', label: 'Opening Balance', kind: 'entry' },
    { id: 'add-profit', label: 'Add: Balance Profit transferred from P&L', kind: 'auto', autoKey: 'balance-profit' },
    { id: 'drawings', label: 'Less: Drawing', kind: 'less', sign: -1 },
    { id: 'total-a', label: 'Total (A)', kind: 'subtotal', autoKey: 'note-sum' },
    { id: 'capital-closing', label: 'Capital As on year end', kind: 'total', autoKey: 'capital-closing' },
  ],
  longTermBorrowings: [{ id: 'long-term-entry', label: 'Long Term Borrowing', kind: 'entry' }],
  otherLongTermLiabilities: [],
  longTermProvisions: [],
  shortTermBorrowings: [],
  tradePayables: [
    { id: 'msme', label: 'Outstanding dues of MSME (6.a)', kind: 'entry' },
    { id: 'other-creditors', label: 'Outstanding dues of other creditors (6.b)', kind: 'entry' },
    { id: 'trade-total', label: 'Total', kind: 'total', autoKey: 'note-sum' },
  ],
  otherCurrentLiabilities: [],
  shortTermProvision: [],
  depreciationAmortization: [
    { id: 'gross-book-value', label: 'Gross Book Value', kind: 'auto', autoKey: 'gross-wdv' },
    { id: 'less-depreciation', label: 'Less: Depreciation', kind: 'auto', autoKey: 'depreciation-total' },
    { id: 'net-book-value', label: 'Net Book Value', kind: 'total', autoKey: 'closing-wdv' },
  ],
  nonCurrentInvestments: [],
  longTermLoansAdvances: [],
  otherNonCurrentAssets: [],
  currentInvestments: [],
  inventoriesTradeReceivables: [
    { id: 'inventories', label: 'Inventories (Closing Stock)', kind: 'entry' },
    { id: 'trade-receivables', label: 'Trade Receivables', kind: 'entry' },
    { id: 'itr-total', label: 'Total', kind: 'total', autoKey: 'note-sum' },
  ],
  balancesRevenueAuthority: [
    { id: 'tds', label: 'TDS', kind: 'entry' },
    { id: 'gst-itc', label: 'GST-ITC', kind: 'entry' },
    { id: 'tcs', label: 'TCS', kind: 'entry' },
    { id: 'advance-tax', label: 'Advance Tax', kind: 'entry' },
    { id: 'gst-cash', label: 'GST Cash', kind: 'entry' },
    { id: 'bra-total', label: 'Total', kind: 'total', autoKey: 'note-sum' },
  ],
  shortTermLoansAdvances: [],
  cashAtBank: [
    { id: 'cash-at-bank', label: 'Cash at Bank', kind: 'entry' },
    { id: 'cash-bank-total', label: 'Total as on year end', kind: 'total', autoKey: 'note-sum' },
  ],
  cashInHand: [
    { id: 'cash-in-hand', label: 'Cash in Hand', kind: 'entry' },
    {
      id: 'cash-flow-adjustment',
      label: 'Cash Flow Adjustment (Sources vs Application)',
      kind: 'auto',
      autoKey: 'cash-flow-adjustment',
    },
    { id: 'cash-in-hand-total', label: 'Total as on year end', kind: 'total', autoKey: 'note-sum' },
  ],
  revenueFromOperations: [
    { id: 'sales-goods', label: 'Sales of Goods', kind: 'entry' },
    { id: 'sales-services', label: 'Sales of Services', kind: 'entry' },
    { id: 'gst-sales', label: 'GST Sales', kind: 'entry' },
    { id: 'revenue-total', label: 'Total', kind: 'total', autoKey: 'note-sum' },
  ],
  otherIncome: [
    { id: 'other-income', label: 'Other Income', kind: 'entry' },
    { id: 'other-income-total', label: 'Total', kind: 'total', autoKey: 'note-sum' },
  ],
  costOfGoodsSold: [
    { id: 'opening-stock', label: 'Opening Stock', kind: 'entry' },
    { id: 'add-purchase', label: 'Add: Purchase', kind: 'entry' },
    { id: 'less-closing-stock', label: 'Less: Closing Stock', kind: 'less', sign: -1 },
    { id: 'total-cogs', label: 'Total Cost of Goods Sold', kind: 'total', autoKey: 'cogs-total' },
    { id: 'gross-profit', label: 'Gross Profit', kind: 'auto', autoKey: 'gross-profit' },
    { id: 'gross-profit-pct', label: '% of Gross Profit', kind: 'percent', autoKey: 'gross-profit-pct' },
  ],
  employeeBenefitExpenses: [
    { id: 'salary', label: 'Salary Expenses', kind: 'entry' },
    { id: 'bonus', label: 'Bonus', kind: 'entry' },
    { id: 'employee-welfare', label: 'Employee Welfare', kind: 'entry' },
    { id: 'employee-others', label: 'Others', kind: 'entry' },
    { id: 'employee-total', label: 'Total', kind: 'total', autoKey: 'note-sum' },
  ],
  otherAdministrativeExpenses: [{ id: 'admin-total', label: 'Total', kind: 'total', autoKey: 'note-sum' }],
  financeCost: [
    { id: 'other-finance', label: 'Other Finance Cost', kind: 'entry' },
    { id: 'total-finance-cost', label: 'Total Finance Cost', kind: 'total', autoKey: 'note-sum' },
  ],
}

function n(value: number) {
  return Number.isFinite(value) ? value : 0
}

function getSubStored(
  noteSubAmounts: NoteSubAmounts,
  noteKey: keyof FsNotes,
  subId: string,
): NoteValue {
  return noteSubAmounts[noteKey]?.[subId] ?? emptyCell()
}

function resolveLedgerLineLabel(
  ledgers: LedgerRecord[],
  group: keyof FsNotes,
  ledgerId: string,
  sign?: CapitalAccountLine['sign'],
) {
  const ledger = getLedgerById(ledgers, ledgerId)
  if (ledger && ledger.group === group) {
    if (group === 'capitalAccount' && sign) {
      return formatLedgerRowLabel({ ...ledger, sign })
    }
    return formatLedgerRowLabel(ledger)
  }
  return ledgerId
}

export function getAdminExpenseSubRows(
  lines: AdministrativeExpenseLine[],
  ledgers: LedgerRecord[] = [],
): NoteSubFieldDef[] {
  return lines.map((line) => ({
    id: adminExpenseSubId(line.id),
    label: resolveLedgerLineLabel(ledgers, 'otherAdministrativeExpenses', line.categoryId),
    kind: 'entry' as const,
  }))
}

export function getManualNoteLineSubRows(
  lines: ManualNoteLine[],
  noteKey: ManualNoteLineKey,
  ledgers: LedgerRecord[] = [],
): NoteSubFieldDef[] {
  return lines
    .filter((line) => line.noteKey === noteKey)
    .map((line) => ({
      id: manualNoteLineSubId(line.id),
      label: resolveLedgerLineLabel(ledgers, noteKey, line.typeId),
      kind: 'entry' as const,
    }))
}

function getCapitalAccountLineSubRows(
  lines: CapitalAccountLine[],
  ledgers: LedgerRecord[] = [],
): NoteSubFieldDef[] {
  return lines.map((line) => ({
    id: capitalAccountLineSubId(line.id),
    label: resolveLedgerLineLabel(ledgers, 'capitalAccount', line.typeId, line.sign),
    kind: line.sign === 'less' ? ('less' as const) : ('entry' as const),
    sign: line.sign === 'less' ? (-1 as const) : undefined,
  }))
}

function getCogsExtraLineSubRows(
  lines: CogsExtraLine[],
  ledgers: LedgerRecord[] = [],
): NoteSubFieldDef[] {
  return lines.map((line) => ({
    id: cogsExtraLineSubId(line.id),
    label: resolveLedgerLineLabel(ledgers, 'costOfGoodsSold', line.typeId, line.sign),
    kind: line.sign === 'less' ? ('less' as const) : ('entry' as const),
    sign: line.sign === 'less' ? (-1 as const) : undefined,
  }))
}

function buildCogsFields(cogsExtraLines: CogsExtraLine[], ledgers: LedgerRecord[] = []) {
  const fixedStart = NOTE_SUB_TEMPLATES.costOfGoodsSold.filter(
    (row) => row.id === 'opening-stock' || row.id === 'add-purchase',
  )
  const dynamicRows = getCogsExtraLineSubRows(cogsExtraLines, ledgers)
  const fixedEnd = NOTE_SUB_TEMPLATES.costOfGoodsSold.filter(
    (row) => row.id !== 'opening-stock' && row.id !== 'add-purchase',
  )
  return [...fixedStart, ...dynamicRows, ...fixedEnd]
}

function buildCapitalAccountFields(
  capitalAccountLines: CapitalAccountLine[],
  ledgers: LedgerRecord[] = [],
): NoteSubFieldDef[] {
  const base = NOTE_SUB_TEMPLATES.capitalAccount.filter((row) => row.id !== 'capital-closing')
  const dynamicRows = getCapitalAccountLineSubRows(capitalAccountLines, ledgers)
  const closing = NOTE_SUB_TEMPLATES.capitalAccount.find((row) => row.id === 'capital-closing')!
  return [...base, ...dynamicRows, closing]
}

function buildManualNoteLineFields(
  noteKey: ManualNoteLineKey,
  manualNoteLines: ManualNoteLine[],
  ledgers: LedgerRecord[] = [],
): NoteSubFieldDef[] {
  const config = MANUAL_NOTE_LINE_CONFIGS[noteKey]
  const manualRows = getManualNoteLineSubRows(manualNoteLines, noteKey, ledgers)

  if (manualRows.length === 0) {
    return []
  }

  const rows: NoteSubFieldDef[] = [...manualRows]

  if (config.totalSubId) {
    rows.push({
      id: config.totalSubId,
      label: 'Total',
      kind: 'total',
      autoKey: 'note-sum',
    })
  }

  return rows
}

export function getManualShortTermBorrowingRows(
  lines: OtherShortTermBorrowingLine[],
  ledgers: LedgerRecord[] = [],
): NoteSubFieldDef[] {
  return lines.map((line) => ({
    id: manualShortTermSubId(line.id),
    label: resolveLedgerLineLabel(ledgers, 'shortTermBorrowings', line.typeId),
    kind: 'entry' as const,
  }))
}

export function isCapitalAccountDynamicLine(noteKey: keyof FsNotes, sub: { id: string }) {
  return noteKey === 'capitalAccount' && sub.id.startsWith('capital-line-')
}

function resolveLegacyLedgerAmount(
  noteKey: keyof FsNotes,
  ledgerId: string,
  ctx: Omit<SubResolveContext, 'noteKey'>,
  previousFallback: number,
): NoteValue | null {
  const subs = ctx.noteSubAmounts[noteKey] ?? {}
  const direct = subs[ledgerId]
  if (direct && (direct.current !== 0 || direct.previous !== 0)) {
    return { current: direct.current, previous: direct.previous ?? previousFallback }
  }

  for (const [subId, amount] of Object.entries(subs)) {
    if (subId.startsWith('admin-line-')) {
      const lineId = subId.replace('admin-line-', '')
      const line = ctx.administrativeExpenseLines.find((item) => item.id === lineId)
      if (line?.categoryId === ledgerId) {
        return { current: amount.current, previous: amount.previous ?? previousFallback }
      }
    }
    if (subId.startsWith('manual-nl-')) {
      const lineId = subId.replace('manual-nl-', '')
      const line = ctx.manualNoteLines.find((item) => item.id === lineId && item.noteKey === noteKey)
      if (line?.typeId === ledgerId) {
        return { current: amount.current, previous: amount.previous ?? previousFallback }
      }
    }
    if (subId.startsWith('capital-line-')) {
      const lineId = subId.replace('capital-line-', '')
      const line = ctx.capitalAccountLines.find((item) => item.id === lineId)
      if (line?.typeId === ledgerId) {
        return { current: amount.current, previous: amount.previous ?? previousFallback }
      }
    }
    if (subId.startsWith('cogs-line-')) {
      const lineId = subId.replace('cogs-line-', '')
      const line = ctx.cogsExtraLines.find((item) => item.id === lineId)
      if (line?.typeId === ledgerId) {
        return { current: amount.current, previous: amount.previous ?? previousFallback }
      }
    }
    if (subId.startsWith('manual-st-')) {
      const lineId = subId.replace('manual-st-', '')
      const line = ctx.otherShortTermBorrowingLines.find((item) => item.id === lineId)
      if (line?.typeId === ledgerId) {
        return { current: amount.current, previous: amount.previous ?? previousFallback }
      }
    }
  }

  return null
}

function resolveEntryStored(
  noteKey: keyof FsNotes,
  def: NoteSubFieldDef,
  ctx: Omit<SubResolveContext, 'noteKey'>,
): NoteValue {
  let stored = getSubStored(ctx.noteSubAmounts, noteKey, def.id)
  const previous =
    ctx.previousYearSubAmounts?.[noteKey]?.[def.id]?.current ?? stored.previous

  for (const rule of NOTE_OPENING_CARRY_RULES) {
    if (noteKey !== rule.targetNoteKey || def.id !== rule.targetSubId) {
      continue
    }
    const priorAmount =
      ctx.previousYearSubAmounts?.[rule.sourceNoteKey]?.[rule.sourceSubId]?.current
    // Only auto-fill opening lines when prior-year closing has a non-zero value.
    if (priorAmount === undefined || priorAmount === 0) {
      continue
    }
    stored = { ...stored, current: priorAmount }
  }

  if (isLedgerSubId(def.id) && stored.current === 0 && stored.previous === 0) {
    const legacy = resolveLegacyLedgerAmount(noteKey, ledgerIdFromSubId(def.id), ctx, previous)
    if (legacy) {
      return legacy
    }
  }

  return { current: stored.current, previous }
}

export function getLoanSubRows(loans: LoanRecord[], type: 'long-term' | 'short-term'): NoteSubFieldDef[] {
  return loans
    .filter((loan) => loan.loanType === type)
    .map((loan) => ({
      id: `loan-${loan.id}`,
      label: loan.lender,
      kind: 'auto' as const,
      autoKey: type === 'long-term' ? 'loan-long-closing' : 'loan-short-closing',
      loanType: type,
    }))
}

export function getFinanceCostInterestRows(
  loans: LoanRecord[],
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[] = [],
  ledgers: LedgerRecord[] = [],
): NoteSubFieldDef[] {
  const hasSchedule = loans.length > 0
  const hasManual = otherShortTermBorrowingLines.length > 0

  if (!hasSchedule && !hasManual) {
    return []
  }

  const longTerm = loans.filter((loan) => loan.loanType === 'long-term')
  const shortTerm = loans.filter((loan) => loan.loanType === 'short-term')
  const rows: NoteSubFieldDef[] = [
    { id: 'interest-main-header', label: 'Interest on Borrowings', kind: 'header' },
  ]

  if (longTerm.length > 0) {
    rows.push({ id: 'interest-lt-header', label: 'Long Term Borrowings', kind: 'header' })
    for (const loan of longTerm) {
      rows.push({
        id: `interest-${loan.id}`,
        label: loan.lender,
        kind: 'auto',
        autoKey: 'loan-interest',
        loanType: 'long-term',
      })
    }
  }

  if (shortTerm.length > 0) {
    rows.push({ id: 'interest-st-header', label: 'Short Term Borrowings (schedule)', kind: 'header' })
    for (const loan of shortTerm) {
      rows.push({
        id: `interest-${loan.id}`,
        label: loan.lender,
        kind: 'auto',
        autoKey: 'loan-interest',
        loanType: 'short-term',
      })
    }
  }

  if (hasManual) {
    rows.push({ id: 'interest-manual-st-header', label: 'Other Borrowings (no schedule)', kind: 'header' })
    for (const line of otherShortTermBorrowingLines) {
      const label = resolveLedgerLineLabel(ledgers, 'shortTermBorrowings', line.typeId)
      rows.push({
        id: manualShortTermInterestSubId(line.id),
        label: `Interest on ${label}`,
        kind: 'entry',
        loanType: 'short-term',
      })
    }
  }

  return rows
}

export function getLoanInterestSubRows(
  loans: LoanRecord[],
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[] = [],
): NoteSubFieldDef[] {
  return getFinanceCostInterestRows(loans, otherShortTermBorrowingLines).filter((row) => row.kind !== 'header')
}

export function getBankCashAtBankSubRows(bankAccounts: BankAccountRecord[]): NoteSubFieldDef[] {
  return getCashAtBankAccounts(bankAccounts).map((account) => ({
    id: bankAccountSubId(account.id),
    label: formatBankAccountNoteLabel(account),
    kind: 'auto' as const,
    autoKey: 'bank-cash-closing',
  }))
}

export function getBankShortTermBorrowingSubRows(bankAccounts: BankAccountRecord[]): NoteSubFieldDef[] {
  return getShortTermBorrowingBankAccounts(bankAccounts).map((account) => ({
    id: bankShortTermSubId(account.id),
    label: formatBankShortTermBorrowingNoteLabel(account),
    kind: 'auto' as const,
    autoKey: 'bank-st-closing',
    loanType: 'short-term' as const,
  }))
}

export function getSubFieldsForNote(
  noteKey: keyof FsNotes,
  loans: LoanRecord[],
  administrativeExpenseLines: AdministrativeExpenseLine[] = [],
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[] = [],
  manualNoteLines: ManualNoteLine[] = [],
  bankAccounts: BankAccountRecord[] = [],
  capitalAccountLines: CapitalAccountLine[] = [],
  cogsExtraLines: CogsExtraLine[] = [],
  ledgers: LedgerRecord[] = [],
): NoteSubFieldDef[] {
  const base = [...NOTE_SUB_TEMPLATES[noteKey]]

  if (noteKey === 'capitalAccount') {
    return buildCapitalAccountFields(capitalAccountLines, ledgers)
  }

  if (noteKey === 'costOfGoodsSold') {
    return buildCogsFields(cogsExtraLines, ledgers)
  }

  if (isManualNoteLineKey(noteKey)) {
    return buildManualNoteLineFields(noteKey, manualNoteLines, ledgers)
  }

  if (noteKey === 'otherAdministrativeExpenses') {
    const expenseRows = getAdminExpenseSubRows(administrativeExpenseLines, ledgers)
    const totalRow: NoteSubFieldDef = {
      id: 'admin-total',
      label: 'Total',
      kind: 'total',
      autoKey: 'note-sum',
    }
    return [...expenseRows, totalRow]
  }

  if (noteKey === 'longTermBorrowings') {
    const loanRows = getLoanSubRows(loans, 'long-term')
    const totalRow: NoteSubFieldDef = {
      id: 'long-term-total',
      label: 'Total',
      kind: 'total',
      autoKey: 'loan-long-closing',
    }
    if (loanRows.length > 0) {
      return [
        { id: 'lt-schedule-header', label: 'From Repayment Schedule', kind: 'header' },
        ...loanRows,
        totalRow,
      ]
    }
    return [...NOTE_SUB_TEMPLATES[noteKey], totalRow]
  }

  if (noteKey === 'shortTermBorrowings') {
    const loanRows = getLoanSubRows(loans, 'short-term')
    const bankRows = getBankShortTermBorrowingSubRows(bankAccounts)
    const manualRows = getManualShortTermBorrowingRows(otherShortTermBorrowingLines, ledgers)
    const totalRow: NoteSubFieldDef = {
      id: 'short-term-total',
      label: 'Total',
      kind: 'total',
      autoKey: 'loan-short-closing',
    }
    const rows: NoteSubFieldDef[] = []

    if (loanRows.length > 0) {
      rows.push({ id: 'st-schedule-header', label: 'From Repayment Schedule', kind: 'header' })
      rows.push(...loanRows)
    }

    if (bankRows.length > 0) {
      rows.push({ id: 'st-bank-header', label: 'From Bank Account (CC / OD)', kind: 'header' })
      rows.push(...bankRows)
    }

    if (manualRows.length > 0) {
      rows.push({ id: 'st-manual-header', label: 'Other Borrowings (no schedule)', kind: 'header' })
      rows.push(...manualRows)
    }

    if (rows.length === 0) {
      return [{ id: 'short-term-entry', label: 'Short Term Borrowing', kind: 'entry' }, totalRow]
    }

    return [...rows, totalRow]
  }

  if (noteKey === 'financeCost') {
    const interestRows = getFinanceCostInterestRows(loans, otherShortTermBorrowingLines, ledgers)
    return [...interestRows, ...base]
  }

  if (noteKey === 'cashAtBank') {
    const bankRows = getBankCashAtBankSubRows(bankAccounts)
    const totalRow: NoteSubFieldDef = {
      id: 'cash-bank-total',
      label: 'Total as on year end',
      kind: 'total',
      autoKey: 'note-sum',
    }
    return bankRows.length > 0 ? [...bankRows, totalRow] : base
  }

  return base
}

export function createEmptyNoteSubAmounts(
  administrativeExpenseLines: AdministrativeExpenseLine[] = [],
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[] = [],
  manualNoteLines: ManualNoteLine[] = [],
  bankAccounts: BankAccountRecord[] = [],
  capitalAccountLines: CapitalAccountLine[] = [],
  cogsExtraLines: CogsExtraLine[] = [],
  ledgers: LedgerRecord[] = [],
): NoteSubAmounts {
  const result: NoteSubAmounts = {}
  for (const field of NOTE_FIELDS) {
    const subs: Record<string, NoteValue> = {}
    for (const sub of getSubFieldsForNote(
      field.key,
      [],
      administrativeExpenseLines,
      otherShortTermBorrowingLines,
      manualNoteLines,
      bankAccounts,
      capitalAccountLines,
      cogsExtraLines,
      ledgers,
    )) {
      if (sub.kind === 'entry' || sub.kind === 'less') {
        subs[sub.id] = emptyCell()
      }
    }
    result[field.key] = subs
  }
  return result
}

function generateManualBorrowingLineId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function normalizeOtherShortTermBorrowingLines(
  raw: OtherShortTermBorrowingLine[] | undefined,
  noteSubAmounts: NoteSubAmounts | undefined,
): OtherShortTermBorrowingLine[] {
  if (raw?.length) {
    return raw.map((line) => ({
      id: line.id,
      typeId: normalizeOtherShortTermBorrowingTypeId(line.typeId),
    }))
  }

  const legacy = noteSubAmounts?.shortTermBorrowings?.['short-term-entry']
  if (legacy && (legacy.current > 0 || legacy.previous > 0)) {
    return [{ id: generateManualBorrowingLineId(), typeId: 'cash-credit' }]
  }

  return []
}

export function migrateOtherShortTermSubAmounts(
  lines: OtherShortTermBorrowingLine[],
  noteSubAmounts: NoteSubAmounts,
): NoteSubAmounts {
  const result: NoteSubAmounts = { ...noteSubAmounts }
  const stSubs = { ...(result.shortTermBorrowings ?? {}) }
  const financeSubs = { ...(result.financeCost ?? {}) }

  const legacy = stSubs['short-term-entry']
  if (legacy && lines.length === 1 && !stSubs[manualShortTermSubId(lines[0].id)]) {
    stSubs[manualShortTermSubId(lines[0].id)] = legacy
    delete stSubs['short-term-entry']
  }

  for (const line of lines) {
    const subId = manualShortTermSubId(line.id)
    const interestSubId = manualShortTermInterestSubId(line.id)
    if (!stSubs[subId]) {
      stSubs[subId] = emptyCell()
    }
    if (!financeSubs[interestSubId]) {
      financeSubs[interestSubId] = emptyCell()
    }
  }

  result.shortTermBorrowings = stSubs
  result.financeCost = financeSubs
  return result
}

function generateManualNoteLineId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function normalizeManualNoteLines(
  raw: ManualNoteLine[] | undefined,
  noteSubAmounts: NoteSubAmounts | undefined,
): ManualNoteLine[] {
  if (raw?.length) {
    return raw.map((line) => {
      const noteKey = line.noteKey as ManualNoteLineKey
      if (!isManualNoteLineKey(noteKey)) {
        return line
      }
      return {
        id: line.id,
        noteKey,
        typeId: normalizeManualNoteLineTypeId(noteKey, line.typeId),
      }
    })
  }

  const result: ManualNoteLine[] = []
  for (const noteKey of MANUAL_NOTE_LINE_KEYS) {
    const config = MANUAL_NOTE_LINE_CONFIGS[noteKey]
    const legacy = noteSubAmounts?.[noteKey]?.[config.legacySubId]
    if (legacy && (legacy.current > 0 || legacy.previous > 0)) {
      result.push({
        id: generateManualNoteLineId(),
        noteKey,
        typeId: config.defaultTypeId,
      })
    }
  }
  return result
}

export function migrateManualNoteLineSubAmounts(
  lines: ManualNoteLine[],
  noteSubAmounts: NoteSubAmounts,
): NoteSubAmounts {
  const result: NoteSubAmounts = { ...noteSubAmounts }

  for (const noteKey of MANUAL_NOTE_LINE_KEYS) {
    const config = MANUAL_NOTE_LINE_CONFIGS[noteKey]
    const noteLines = lines.filter((line) => line.noteKey === noteKey)
    const subs = { ...(result[noteKey] ?? {}) }

    const legacy = subs[config.legacySubId]
    if (legacy && noteLines.length === 1 && !subs[manualNoteLineSubId(noteLines[0].id)]) {
      subs[manualNoteLineSubId(noteLines[0].id)] = {
        current: legacy.current,
        previous: 0,
      }
      delete subs[config.legacySubId]
    }

    for (const line of noteLines) {
      const subId = manualNoteLineSubId(line.id)
      if (!subs[subId]) {
        subs[subId] = emptyCell()
      }
    }

    result[noteKey] = subs
  }

  return result
}

function generateAdminLineId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function normalizeAdministrativeExpenseLines(
  raw: AdministrativeExpenseLine[] | undefined,
  noteSubAmounts: NoteSubAmounts | undefined,
): AdministrativeExpenseLine[] {
  if (raw?.length) {
    return raw.map((line) => ({
      id: line.id,
      categoryId: normalizeAdminCategoryId(line.categoryId),
    }))
  }

  const legacy = noteSubAmounts?.otherAdministrativeExpenses?.['admin-expenses']
  if (legacy && (legacy.current > 0 || legacy.previous > 0)) {
    return [{ id: generateAdminLineId(), categoryId: 'others' }]
  }

  return []
}

export function migrateAdminExpenseSubAmounts(
  lines: AdministrativeExpenseLine[],
  noteSubAmounts: NoteSubAmounts,
): NoteSubAmounts {
  const result: NoteSubAmounts = { ...noteSubAmounts }
  const adminSubs = { ...(result.otherAdministrativeExpenses ?? {}) }

  const legacy = adminSubs['admin-expenses']
  if (legacy && lines.length === 1 && !adminSubs[adminExpenseSubId(lines[0].id)]) {
    adminSubs[adminExpenseSubId(lines[0].id)] = legacy
    delete adminSubs['admin-expenses']
  }

  for (const line of lines) {
    const subId = adminExpenseSubId(line.id)
    if (!adminSubs[subId]) {
      adminSubs[subId] = emptyCell()
    }
  }

  result.otherAdministrativeExpenses = adminSubs
  return result
}

function matchBreakdownAmount(
  noteBreakdowns: NoteBreakdowns | undefined,
  noteKey: keyof FsNotes,
  patterns: string[],
  period: 'current' | 'previous',
) {
  const rows = noteBreakdowns?.[noteKey]?.[period] ?? []
  for (const pattern of patterns) {
    const row = rows.find((item) => item.particular.toLowerCase().includes(pattern.toLowerCase()))
    if (row) {
      return row.amount
    }
  }
  return 0
}

const SUB_LABEL_ALIASES: Partial<Record<keyof FsNotes, Record<string, string[]>>> = {
  capitalAccount: {
    'opening-balance': ['opening'],
  },
  tradePayables: {
    msme: ['msme'],
    'other-creditors': ['other creditor', 'creditor'],
  },
  inventoriesTradeReceivables: {
    inventories: ['inventor', 'stock'],
    'trade-receivables': ['receivable', 'debtor'],
  },
  revenueFromOperations: {
    'sales-goods': ['sales of goods', 'goods'],
    'sales-services': ['sales of services', 'services'],
  },
  costOfGoodsSold: {
    'opening-stock': ['opening'],
    'add-purchase': ['purchase'],
    'less-closing-stock': ['closing'],
  },
  employeeBenefitExpenses: {
    salary: ['salary'],
    bonus: ['bonus'],
    'employee-welfare': ['welfare'],
    'employee-others': ['other'],
  },
  balancesRevenueAuthority: {
    tds: ['tds'],
    'gst-itc': ['gst-itc', 'itc'],
    tcs: ['tcs'],
    'advance-tax': ['advance tax'],
    'gst-cash': ['gst cash'],
  },
}

export function normalizeNoteSubAmounts(
  raw: NoteSubAmounts | undefined,
  noteBreakdowns: NoteBreakdowns | undefined,
  loans: LoanRecord[] = [],
  administrativeExpenseLines: AdministrativeExpenseLine[] = [],
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[] = [],
  manualNoteLines: ManualNoteLine[] = [],
  bankAccounts: BankAccountRecord[] = [],
  capitalAccountLines: CapitalAccountLine[] = [],
  cogsExtraLines: CogsExtraLine[] = [],
  ledgers: LedgerRecord[] = [],
): NoteSubAmounts {
  const result = createEmptyNoteSubAmounts(
    administrativeExpenseLines,
    otherShortTermBorrowingLines,
    manualNoteLines,
    bankAccounts,
    capitalAccountLines,
    cogsExtraLines,
    ledgers,
  )

  for (const field of NOTE_FIELDS) {
    const noteKey = field.key
    const stored = raw?.[noteKey] ?? {}
    const aliases = SUB_LABEL_ALIASES[noteKey] ?? {}

    for (const sub of getSubFieldsForNote(
      noteKey,
      loans,
      administrativeExpenseLines,
      otherShortTermBorrowingLines,
      manualNoteLines,
      bankAccounts,
      capitalAccountLines,
      cogsExtraLines,
      ledgers,
    )) {
      if (sub.kind !== 'entry' && sub.kind !== 'less') {
        continue
      }

      const fromStore = stored[sub.id]
      if (fromStore) {
        result[noteKey]![sub.id] = {
          current: Number(fromStore.current) || 0,
          previous: Number(fromStore.previous) || 0,
        }
        continue
      }

      const patterns = aliases[sub.id] ?? [sub.label]
      result[noteKey]![sub.id] = {
        current: matchBreakdownAmount(noteBreakdowns, noteKey, patterns, 'current'),
        previous: matchBreakdownAmount(noteBreakdowns, noteKey, patterns, 'previous'),
      }
    }
  }

  return result
}

/** Merge stored subs with all defined note sub-lines so save payloads are complete. */
export function buildCompleteNoteSubAmounts(
  raw: NoteSubAmounts | undefined,
  noteBreakdowns: NoteBreakdowns | undefined,
  loans: LoanRecord[],
  administrativeExpenseLines: AdministrativeExpenseLine[],
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[],
  manualNoteLines: ManualNoteLine[],
  bankAccounts: BankAccountRecord[],
  capitalAccountLines: CapitalAccountLine[],
  cogsExtraLines: CogsExtraLine[],
  ledgers: LedgerRecord[],
): NoteSubAmounts {
  let subs = normalizeNoteSubAmounts(
    raw,
    noteBreakdowns,
    loans,
    administrativeExpenseLines,
    otherShortTermBorrowingLines,
    manualNoteLines,
    bankAccounts,
    capitalAccountLines,
    cogsExtraLines,
    ledgers,
  )
  subs = migrateAdminExpenseSubAmounts(administrativeExpenseLines, subs)
  subs = migrateOtherShortTermSubAmounts(otherShortTermBorrowingLines, subs)
  subs = migrateManualNoteLineSubAmounts(manualNoteLines, subs)
  subs = migrateCapitalAccountSubAmounts(capitalAccountLines, subs)
  subs = migrateCogsExtraSubAmounts(cogsExtraLines, subs)
  return subs
}

interface SubResolveContext {
  noteKey: keyof FsNotes
  noteSubAmounts: NoteSubAmounts
  previousYearSubAmounts: NoteSubAmounts | null
  computed: ComputedStatements
  depGrossWdv: number
  depPrevGrossWdv: number
  depClosingWdv: number
  depPrevClosingWdv: number
  depTotal: number
  depPrevTotal: number
  loans: LoanRecord[]
  loanClosings: Map<string, NoteValue>
  loanInterests: Map<string, NoteValue>
  revenueTotal: NoteValue
  administrativeExpenseLines: AdministrativeExpenseLine[]
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[]
  manualNoteLines: ManualNoteLine[]
  capitalAccountLines: CapitalAccountLine[]
  cogsExtraLines: CogsExtraLine[]
  ledgers: LedgerRecord[]
  plAppropriationTotal: NoteValue
  balanceProfit: NoteValue
  bankAccounts: BankAccountRecord[]
  bankBalances: Map<string, NoteValue>
  bankStBalances: Map<string, NoteValue>
  cashAdjustment: NoteValue
  openingBalanceLocks?: OpeningBalanceLocks | null
}

function getNetProfit(computed: ComputedStatements): NoteValue {
  const row = computed.profitAndLoss.find((line) => line.label === 'Net Profit / (Loss)')
  return { current: row?.current ?? 0, previous: row?.previous ?? 0 }
}

function sumEntrySubs(
  defs: NoteSubFieldDef[],
  resolved: Map<string, NoteValue>,
  includeKinds: NoteSubKind[] = ['entry'],
) {
  const total = { current: 0, previous: 0 }
  for (const def of defs) {
    if (!includeKinds.includes(def.kind)) {
      continue
    }
    const value = resolved.get(def.id) ?? emptyCell()
    total.current += value.current
    total.previous += value.previous
  }
  return total
}

function sumLoanClosingsFromDefs(
  defs: NoteSubFieldDef[],
  loanClosings: Map<string, NoteValue>,
) {
  return defs
    .filter((item) => item.id.startsWith('loan-'))
    .reduce(
      (acc, item) => {
        const val = loanClosings.get(item.id) ?? emptyCell()
        return {
          current: acc.current + val.current,
          previous: acc.previous + val.previous,
        }
      },
      { current: 0, previous: 0 },
    )
}

function sumResolvedSubs(
  defs: NoteSubFieldDef[],
  resolved: Map<string, NoteValue>,
  idPrefix: string,
) {
  return defs
    .filter((item) => item.id.startsWith(idPrefix))
    .reduce(
      (acc, item) => {
        const val = resolved.get(item.id) ?? emptyCell()
        return {
          current: acc.current + val.current,
          previous: acc.previous + val.previous,
        }
      },
      { current: 0, previous: 0 },
    )
}

function calcCogs(resolved: Map<string, NoteValue>, defs: NoteSubFieldDef[]) {
  const opening = resolved.get('opening-stock') ?? emptyCell()
  const purchase = resolved.get('add-purchase') ?? emptyCell()
  const closing = resolved.get('less-closing-stock') ?? emptyCell()

  let addTotal = opening.current + purchase.current
  let lessTotal = closing.current
  let addPrev = opening.previous + purchase.previous
  let lessPrev = closing.previous

  for (const def of defs) {
    if (
      def.id === 'opening-stock' ||
      def.id === 'add-purchase' ||
      def.id === 'less-closing-stock' ||
      def.kind === 'total' ||
      def.kind === 'auto' ||
      def.kind === 'percent'
    ) {
      continue
    }

    if (def.id.startsWith('cogs-line-') || isLedgerSubId(def.id)) {
      const val = resolved.get(def.id) ?? emptyCell()
      if (def.kind === 'less') {
        lessTotal += val.current
        lessPrev += val.previous
      } else if (def.kind === 'entry') {
        addTotal += val.current
        addPrev += val.previous
      }
    }
  }

  return {
    current: addTotal - lessTotal,
    previous: addPrev - lessPrev,
  }
}

function calcCapitalClosing(
  resolved: Map<string, NoteValue>,
  balanceProfit: NoteValue,
  capitalAccountLines: CapitalAccountLine[],
) {
  const opening = resolved.get('opening-balance') ?? emptyCell()
  const drawings = resolved.get('drawings') ?? emptyCell()
  let addTotal = { current: 0, previous: 0 }
  let lessTotal = { current: 0, previous: 0 }

  for (const line of capitalAccountLines) {
    const val = resolved.get(capitalAccountLineSubId(line.id)) ?? emptyCell()
    if (line.sign === 'less') {
      lessTotal = {
        current: lessTotal.current + val.current,
        previous: lessTotal.previous + val.previous,
      }
    } else {
      addTotal = {
        current: addTotal.current + val.current,
        previous: addTotal.previous + val.previous,
      }
    }
  }

  return {
    current:
      opening.current + balanceProfit.current - drawings.current + addTotal.current - lessTotal.current,
    previous:
      opening.previous +
      balanceProfit.previous -
      drawings.previous +
      addTotal.previous -
      lessTotal.previous,
  }
}

export function resolveNoteSubRows(
  noteKey: keyof FsNotes,
  ctx: Omit<SubResolveContext, 'noteKey'>,
): ResolvedSubRow[] {
  const defs = getSubFieldsForNote(
    noteKey,
    ctx.loans,
    ctx.administrativeExpenseLines,
    ctx.otherShortTermBorrowingLines,
    ctx.manualNoteLines,
    ctx.bankAccounts,
    ctx.capitalAccountLines,
    ctx.cogsExtraLines,
    ctx.ledgers,
  )
  const resolved = new Map<string, NoteValue>()
  const netProfit = getNetProfit(ctx.computed)
  const balanceProfit = ctx.balanceProfit

  for (const def of defs) {
    if (def.kind === 'entry' || def.kind === 'less') {
      resolved.set(def.id, resolveEntryStored(noteKey, def, ctx))
    }
  }

  for (const def of defs) {
    if (def.kind === 'auto' || def.kind === 'total' || def.kind === 'subtotal' || def.kind === 'percent') {
      let value = emptyCell()

      if (def.autoKey === 'net-profit') {
        value = netProfit
      } else if (def.autoKey === 'balance-profit') {
        value = balanceProfit
      } else if (def.autoKey === 'depreciation-total') {
        value = { current: ctx.depTotal, previous: ctx.depPrevTotal }
      } else if (def.autoKey === 'closing-wdv') {
        value = { current: ctx.depClosingWdv, previous: ctx.depPrevClosingWdv }
      } else if (def.autoKey === 'gross-wdv') {
        value = { current: ctx.depGrossWdv, previous: ctx.depPrevGrossWdv }
      } else if (def.autoKey === 'loan-long-closing' && def.id === 'long-term-total') {
        const loanTotal = sumLoanClosingsFromDefs(defs, ctx.loanClosings)
        const manualEntry = resolved.get('long-term-entry') ?? emptyCell()
        value = {
          current: loanTotal.current + manualEntry.current,
          previous: loanTotal.previous + manualEntry.previous,
        }
      } else if (def.autoKey === 'loan-short-closing' && def.id === 'short-term-total') {
        const loanTotal = sumLoanClosingsFromDefs(defs, ctx.loanClosings)
        const manualTotal = sumResolvedSubs(defs, resolved, 'manual-st-')
        const bankTotal = sumResolvedSubs(defs, resolved, 'bank-st-')
        const legacyEntry = resolved.get('short-term-entry') ?? emptyCell()
        value = {
          current: loanTotal.current + manualTotal.current + bankTotal.current + legacyEntry.current,
          previous:
            loanTotal.previous + manualTotal.previous + bankTotal.previous + legacyEntry.previous,
        }
      } else if (def.id.startsWith('loan-') && def.autoKey === 'loan-long-closing') {
        value = ctx.loanClosings.get(def.id) ?? emptyCell()
      } else if (def.id.startsWith('loan-') && def.autoKey === 'loan-short-closing') {
        value = ctx.loanClosings.get(def.id) ?? emptyCell()
      } else if (def.id.startsWith('interest-') && def.autoKey === 'loan-interest') {
        value = ctx.loanInterests.get(def.id) ?? emptyCell()
      } else if (def.id.startsWith('bank-') && def.autoKey === 'bank-cash-closing') {
        value = ctx.bankBalances.get(def.id) ?? emptyCell()
      } else if (def.id.startsWith('bank-st-') && def.autoKey === 'bank-st-closing') {
        value = ctx.bankStBalances.get(def.id) ?? emptyCell()
      } else if (def.autoKey === 'cash-flow-adjustment') {
        value = ctx.cashAdjustment
      } else if (def.autoKey === 'cogs-total') {
        value = calcCogs(resolved, defs)
      } else if (def.autoKey === 'gross-profit') {
        const cogs = calcCogs(resolved, defs)
        value = {
          current: ctx.revenueTotal.current - cogs.current,
          previous: ctx.revenueTotal.previous - cogs.previous,
        }
      } else if (def.autoKey === 'gross-profit-pct') {
        const cogs = calcCogs(resolved, defs)
        const gp = {
          current: ctx.revenueTotal.current - cogs.current,
          previous: ctx.revenueTotal.previous - cogs.previous,
        }
        value = {
          current:
            ctx.revenueTotal.current === 0 ? 0 : (gp.current / ctx.revenueTotal.current) * 100,
          previous:
            ctx.revenueTotal.previous === 0 ? 0 : (gp.previous / ctx.revenueTotal.previous) * 100,
        }
      } else if (def.autoKey === 'capital-closing') {
        value = calcCapitalClosing(resolved, balanceProfit, ctx.capitalAccountLines)
      } else if (def.autoKey === 'note-sum') {
        const entryTotal = sumEntrySubs(
          defs.filter((item) => item.id !== def.id),
          resolved,
          ['entry', 'less'],
        )
        if (noteKey === 'financeCost') {
          const otherFinance = resolved.get('other-finance') ?? emptyCell()
          const scheduleInterest = defs
            .filter((item) => item.kind === 'auto' && item.autoKey === 'loan-interest')
            .reduce(
              (acc, item) => {
                const val = ctx.loanInterests.get(item.id) ?? resolved.get(item.id) ?? emptyCell()
                return {
                  current: acc.current + val.current,
                  previous: acc.previous + val.previous,
                }
              },
              { current: 0, previous: 0 },
            )
          const manualInterest = defs
            .filter((item) => item.id.startsWith('interest-manual-st-'))
            .reduce(
              (acc, item) => {
                const val = resolved.get(item.id) ?? emptyCell()
                return {
                  current: acc.current + val.current,
                  previous: acc.previous + val.previous,
                }
              },
              { current: 0, previous: 0 },
            )
          value = {
            current: otherFinance.current + scheduleInterest.current + manualInterest.current,
            previous: otherFinance.previous + scheduleInterest.previous + manualInterest.previous,
          }
        } else if (noteKey === 'longTermBorrowings' || noteKey === 'shortTermBorrowings') {
          const loanTotal = sumLoanClosingsFromDefs(defs, ctx.loanClosings)
          const manualTotal = sumResolvedSubs(defs, resolved, 'manual-st-')
          const bankStTotal = sumResolvedSubs(defs, resolved, 'bank-st-')
          const longTermManual = resolved.get('long-term-entry') ?? emptyCell()
          const shortTermLegacy = resolved.get('short-term-entry') ?? emptyCell()
          const combined =
            noteKey === 'longTermBorrowings'
              ? {
                  current: loanTotal.current + longTermManual.current,
                  previous: loanTotal.previous + longTermManual.previous,
                }
              : {
                  current:
                    loanTotal.current +
                    manualTotal.current +
                    bankStTotal.current +
                    shortTermLegacy.current,
                  previous:
                    loanTotal.previous +
                    manualTotal.previous +
                    bankStTotal.previous +
                    shortTermLegacy.previous,
                }
          value =
            combined.current > 0 || combined.previous > 0
              ? combined
              : sumEntrySubs(defs.filter((item) => item.id !== def.id), resolved, ['entry'])
        } else if (noteKey === 'cashAtBank') {
          const bankTotal = defs
            .filter((item) => item.id.startsWith('bank-') && item.autoKey === 'bank-cash-closing')
            .reduce(
              (acc, item) => {
                const val = ctx.bankBalances.get(item.id) ?? resolved.get(item.id) ?? emptyCell()
                return {
                  current: acc.current + val.current,
                  previous: acc.previous + val.previous,
                }
              },
              { current: 0, previous: 0 },
            )
          value =
            bankTotal.current > 0 || bankTotal.previous > 0
              ? bankTotal
              : sumEntrySubs(defs.filter((item) => item.id !== def.id), resolved, ['entry'])
        } else if (noteKey === 'cashInHand') {
          const cashEntry = resolved.get('cash-in-hand') ?? emptyCell()
          const cashAdj = resolved.get('cash-flow-adjustment') ?? emptyCell()
          value = {
            current: cashEntry.current + cashAdj.current,
            previous: cashEntry.previous + cashAdj.previous,
          }
        } else {
          value = entryTotal
        }
      } else if (def.id === 'total-a') {
        const opening = resolved.get('opening-balance') ?? emptyCell()
        const drawings = resolved.get('drawings') ?? emptyCell()
        value = {
          current: opening.current + balanceProfit.current - drawings.current,
          previous: opening.previous + balanceProfit.previous - drawings.previous,
        }
      }

      resolved.set(def.id, value)
    }
  }

  return defs.map((def) => {
    if (def.kind === 'header') {
      return {
        id: def.id,
        label: def.label,
        kind: def.kind,
        current: 0,
        previous: 0,
        editable: false,
        isAuto: false,
        loanType: def.loanType,
      }
    }

    const value = resolved.get(def.id) ?? emptyCell()
    const editable = !isNoteSubCurrentYearReadOnly(noteKey, def, {
      openingBalanceLocks: ctx.openingBalanceLocks,
      previousYearSubAmounts: ctx.previousYearSubAmounts,
    })
    return {
      id: def.id,
      label: def.label,
      kind: def.kind,
      current: def.kind === 'percent' ? n(value.current) : value.current,
      previous: def.kind === 'percent' ? n(value.previous) : value.previous,
      editable,
      isAuto: !editable,
      loanType: def.loanType,
    }
  })
}

export function getNoteTotalFromSubs(
  _noteKey: keyof FsNotes,
  rows: ResolvedSubRow[],
): NoteValue {
  const totalRow =
    [...rows].reverse().find((row) => row.kind === 'total') ??
    rows.find((row) => row.kind === 'subtotal')

  if (totalRow) {
    return { current: totalRow.current, previous: totalRow.previous }
  }

  const sum = rows
    .filter((row) => row.kind === 'entry' || row.kind === 'less')
    .reduce(
      (acc, row) => ({
        current: acc.current + row.current,
        previous: acc.previous + row.previous,
      }),
      { current: 0, previous: 0 },
    )

  if (sum.current !== 0 || sum.previous !== 0) {
    return sum
  }

  const single = rows.find((row) => row.kind === 'entry')
  return single ? { current: single.current, previous: single.previous } : { current: 0, previous: 0 }
}

export function enrichPreviousYearSubAmountsWithClosings(
  noteSubAmounts: NoteSubAmounts,
  context: Omit<SubResolveContext, 'noteKey'>,
): NoteSubAmounts {
  const next: NoteSubAmounts = { ...noteSubAmounts }

  for (const [noteKey, sourceSubId] of [
    ['capitalAccount', 'capital-closing'],
    ['costOfGoodsSold', 'less-closing-stock'],
  ] as const) {
    const rows = resolveNoteSubRows(noteKey, context)
    const closingRow = rows.find((row) => row.id === sourceSubId)
    if (!closingRow) {
      continue
    }

    next[noteKey] = {
      ...(next[noteKey] ?? {}),
      [sourceSubId]: { current: closingRow.current, previous: closingRow.previous },
    }
  }

  return next
}

export function buildSubResolveContext(
  noteSubAmounts: NoteSubAmounts,
  previousYearSubAmounts: NoteSubAmounts | null,
  computed: ComputedStatements,
  depreciationSchedule: import('../types/fs').DepreciationRow[],
  previousYearDepreciation: import('../types/fs').PreviousYearDepreciationSummary,
  loans: LoanRecord[],
  computedLoans: { id: string; closingBalance: number; interestForYear: number; lender: string }[],
  administrativeExpenseLines: AdministrativeExpenseLine[] = [],
  previousYearComputedLoans: {
    id: string
    closingBalance: number
    interestForYear: number
    lender: string
  }[] = [],
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[] = [],
  manualNoteLines: ManualNoteLine[] = [],
  plAppropriationTotal: NoteValue = { current: 0, previous: 0 },
  bankAccounts: BankAccountRecord[] = [],
  previousYearBankAccounts: BankAccountRecord[] = [],
  capitalAccountLines: CapitalAccountLine[] = [],
  cogsExtraLines: CogsExtraLine[] = [],
  ledgers: LedgerRecord[] = [],
  openingBalanceLocks: OpeningBalanceLocks | null = null,
  cashAdjustment: NoteValue = { current: 0, previous: 0 },
): Omit<SubResolveContext, 'noteKey'> {
  const depTotals = sumDepreciationSchedule(depreciationSchedule)
  const depGrossWdv = depTotals.closingWdv + depTotals.depreciation
  const depPrevGrossWdv =
    previousYearDepreciation.closingWdv + previousYearDepreciation.depreciation
  const loanClosings = new Map<string, NoteValue>()
  const loanInterests = new Map<string, NoteValue>()
  const bankBalances = buildBankCashAtBankBalances(bankAccounts, previousYearBankAccounts)
  const bankStBalances = buildBankShortTermBorrowingBalances(bankAccounts, previousYearBankAccounts)
  const prevClosingById = new Map(
    previousYearComputedLoans.map((loan) => [loan.id, loan.closingBalance]),
  )
  const prevClosingByLender = new Map(
    previousYearComputedLoans.map((loan) => [loan.lender.trim().toLowerCase(), loan.closingBalance]),
  )
  const prevInterestById = new Map(
    previousYearComputedLoans.map((loan) => [loan.id, loan.interestForYear]),
  )
  const prevInterestByLender = new Map(
    previousYearComputedLoans.map((loan) => [loan.lender.trim().toLowerCase(), loan.interestForYear]),
  )

  for (const loan of computedLoans) {
    const lenderKey = loan.lender.trim().toLowerCase()
    const storedPrevClosingLt =
      previousYearSubAmounts?.longTermBorrowings?.[`loan-${loan.id}`]?.current ?? 0
    const storedPrevClosingSt =
      previousYearSubAmounts?.shortTermBorrowings?.[`loan-${loan.id}`]?.current ?? 0
    const storedPrevClosing = storedPrevClosingLt || storedPrevClosingSt
    const previousClosing =
      prevClosingById.get(loan.id) ??
      prevClosingByLender.get(lenderKey) ??
      storedPrevClosing

    const storedPrevInterest =
      previousYearSubAmounts?.financeCost?.[`interest-${loan.id}`]?.current ?? 0
    const previousInterest =
      prevInterestById.get(loan.id) ?? prevInterestByLender.get(lenderKey) ?? storedPrevInterest

    loanClosings.set(`loan-${loan.id}`, {
      current: loan.closingBalance,
      previous: previousClosing,
    })
    loanInterests.set(`interest-${loan.id}`, { current: loan.interestForYear, previous: previousInterest })
  }

  const currentLoanIds = new Set(computedLoans.map((loan) => loan.id))
  for (const loan of previousYearComputedLoans) {
    if (currentLoanIds.has(loan.id)) {
      continue
    }
    loanClosings.set(`loan-${loan.id}`, {
      current: 0,
      previous: loan.closingBalance,
    })
    loanInterests.set(`interest-${loan.id}`, {
      current: 0,
      previous: loan.interestForYear,
    })
  }

  const revenueRows = resolveNoteSubRows('revenueFromOperations', {
    noteSubAmounts,
    previousYearSubAmounts,
    computed,
    depGrossWdv,
    depPrevGrossWdv,
    depClosingWdv: depTotals.closingWdv,
    depPrevClosingWdv: previousYearDepreciation.closingWdv,
    depTotal: depTotals.depreciation,
    depPrevTotal: previousYearDepreciation.depreciation,
    loans,
    loanClosings,
    loanInterests,
    revenueTotal: { current: 0, previous: 0 },
    administrativeExpenseLines,
    otherShortTermBorrowingLines,
    manualNoteLines,
    capitalAccountLines,
    cogsExtraLines,
    ledgers,
    plAppropriationTotal,
    balanceProfit: calcBalanceProfit(
      {
        current:
          computed.profitAndLoss.find((line) => line.label === 'Net Profit / (Loss)')?.current ?? 0,
        previous:
          computed.profitAndLoss.find((line) => line.label === 'Net Profit / (Loss)')?.previous ?? 0,
      },
      plAppropriationTotal,
    ),
    bankAccounts,
    bankBalances,
    bankStBalances,
    cashAdjustment: {
      current: n(cashAdjustment.current),
      previous: n(cashAdjustment.previous),
    },
  })
  const revenueTotal = getNoteTotalFromSubs('revenueFromOperations', revenueRows)

  const balanceProfit = calcBalanceProfit(
    {
      current:
        computed.profitAndLoss.find((line) => line.label === 'Net Profit / (Loss)')?.current ?? 0,
      previous:
        computed.profitAndLoss.find((line) => line.label === 'Net Profit / (Loss)')?.previous ?? 0,
    },
    plAppropriationTotal,
  )

  return {
    noteSubAmounts,
    previousYearSubAmounts,
    computed,
    depGrossWdv,
    depPrevGrossWdv,
    depClosingWdv: depTotals.closingWdv,
    depPrevClosingWdv: previousYearDepreciation.closingWdv,
    depTotal: depTotals.depreciation,
    depPrevTotal: previousYearDepreciation.depreciation,
    loans,
    loanClosings,
    loanInterests,
    revenueTotal,
    administrativeExpenseLines,
    otherShortTermBorrowingLines,
    manualNoteLines,
    capitalAccountLines,
    cogsExtraLines,
    ledgers,
    plAppropriationTotal,
    balanceProfit,
    bankAccounts,
    bankBalances,
    bankStBalances,
    cashAdjustment: {
      current: n(cashAdjustment.current),
      previous: n(cashAdjustment.previous),
    },
    openingBalanceLocks,
  }
}

export function buildNotesFromSubAmounts(
  noteSubAmounts: NoteSubAmounts,
  previousYearSubAmounts: NoteSubAmounts | null,
  computed: ComputedStatements,
  depreciationSchedule: import('../types/fs').DepreciationRow[],
  previousYearDepreciation: import('../types/fs').PreviousYearDepreciationSummary,
  loans: LoanRecord[],
  computedLoans: { id: string; closingBalance: number; interestForYear: number; lender: string }[],
  administrativeExpenseLines: AdministrativeExpenseLine[] = [],
  previousYearComputedLoans: {
    id: string
    closingBalance: number
    interestForYear: number
    lender: string
  }[] = [],
  otherShortTermBorrowingLines: OtherShortTermBorrowingLine[] = [],
  manualNoteLines: ManualNoteLine[] = [],
  plAppropriationTotal: NoteValue = { current: 0, previous: 0 },
  bankAccounts: BankAccountRecord[] = [],
  previousYearBankAccounts: BankAccountRecord[] = [],
  capitalAccountLines: CapitalAccountLine[] = [],
  cogsExtraLines: CogsExtraLine[] = [],
  ledgers: LedgerRecord[] = [],
  cashAdjustment: NoteValue = { current: 0, previous: 0 },
): FsNotes {
  const base = {} as FsNotes
  const ctx = buildSubResolveContext(
    noteSubAmounts,
    previousYearSubAmounts,
    computed,
    depreciationSchedule,
    previousYearDepreciation,
    loans,
    computedLoans,
    administrativeExpenseLines,
    previousYearComputedLoans,
    otherShortTermBorrowingLines,
    manualNoteLines,
    plAppropriationTotal,
    bankAccounts,
    previousYearBankAccounts,
    capitalAccountLines,
    cogsExtraLines,
    ledgers,
    null,
    cashAdjustment,
  )

  for (const field of NOTE_FIELDS) {
    const rows = resolveNoteSubRows(field.key, ctx)
    base[field.key] = getNoteTotalFromSubs(field.key, rows)
  }

  return base
}
