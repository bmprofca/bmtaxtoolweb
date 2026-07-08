import type { FsNotes, NoteValue, StatementLine } from '../types/fs'

function n(value: number) {
  return Number.isFinite(value) ? value : 0
}

export function profitLossRowId(noteKey: keyof FsNotes, noteSubId?: string) {
  return noteSubId ? `pl-row-${noteKey}-${noteSubId}` : `pl-row-${noteKey}`
}

export function isProfitLossNoteNo(noteNo: string) {
  const value = Number.parseInt(noteNo, 10)
  return Number.isFinite(value) && value >= 19 && value <= 24
}

function line(
  label: string,
  current: number,
  previous: number,
  opts?: Partial<StatementLine>,
): StatementLine {
  const row: StatementLine = { label, current: n(current), previous: n(previous), ...opts }
  if (row.noteKey) {
    row.rowId = profitLossRowId(row.noteKey, row.noteSubId)
  }
  return row
}

export interface ProfitLossBuildInput {
  notes: FsNotes
  depCurrent: number
  depPrevious: number
  loanInterestCurrent: number
  loanInterestPrevious: number
  hasLoans: boolean
  plAppropriationTotal: NoteValue
}

export const NOTE_SUB_PL_REFS: Record<string, string> = {
  'gross-profit': '21',
  'gross-profit-pct': '21',
  'opening-stock': '21',
  'add-purchase': '21',
  'less-closing-stock': '21',
  'total-cogs': '21',
  'balance-profit': '1',
}

export function buildProfitLossLines(input: ProfitLossBuildInput): StatementLine[] {
  const {
    notes,
    depCurrent,
    depPrevious,
    loanInterestCurrent,
    loanInterestPrevious,
    hasLoans,
    plAppropriationTotal,
  } = input

  const totalIncomeCurrent = notes.revenueFromOperations.current + notes.otherIncome.current
  const totalIncomePrevious = notes.revenueFromOperations.previous + notes.otherIncome.previous

  const costOfSalesCurrent = notes.costOfGoodsSold.current
  const costOfSalesPrevious = notes.costOfGoodsSold.previous

  const grossProfitCurrent = totalIncomeCurrent - costOfSalesCurrent
  const grossProfitPrevious = totalIncomePrevious - costOfSalesPrevious

  const totalExpensesCurrent =
    notes.employeeBenefitExpenses.current +
    notes.otherAdministrativeExpenses.current +
    notes.financeCost.current +
    depCurrent
  const totalExpensesPrevious =
    notes.employeeBenefitExpenses.previous +
    notes.otherAdministrativeExpenses.previous +
    notes.financeCost.previous +
    depPrevious

  const netProfitCurrent = grossProfitCurrent - totalExpensesCurrent
  const netProfitPrevious = grossProfitPrevious - totalExpensesPrevious

  const balanceProfitCurrent = netProfitCurrent - plAppropriationTotal.current
  const balanceProfitPrevious = netProfitPrevious - plAppropriationTotal.previous

  return [
    line('Revenue from Operation', notes.revenueFromOperations.current, notes.revenueFromOperations.previous, {
      noteNo: '19',
      noteKey: 'revenueFromOperations',
    }),
    line('Other Income', notes.otherIncome.current, notes.otherIncome.previous, {
      noteNo: '20',
      noteKey: 'otherIncome',
    }),
    line('Total Income', totalIncomeCurrent, totalIncomePrevious, { isTotal: true }),
    line('Cost of Goods Sold', costOfSalesCurrent, costOfSalesPrevious, {
      isTotal: true,
      noteNo: '21',
      noteKey: 'costOfGoodsSold',
    }),
    line('Gross Profit', grossProfitCurrent, grossProfitPrevious, {
      isTotal: true,
      noteNo: '21',
      noteKey: 'costOfGoodsSold',
      noteSubId: 'gross-profit',
    }),
    line(
      'Employee Benefit Expenses',
      notes.employeeBenefitExpenses.current,
      notes.employeeBenefitExpenses.previous,
      { noteNo: '22', noteKey: 'employeeBenefitExpenses' },
    ),
    line(
      'Other Administrative Expenses',
      notes.otherAdministrativeExpenses.current,
      notes.otherAdministrativeExpenses.previous,
      { noteNo: '23', noteKey: 'otherAdministrativeExpenses' },
    ),
    line('Finance Cost', notes.financeCost.current, notes.financeCost.previous, {
      noteNo: '24',
      noteKey: 'financeCost',
    }),
    ...(hasLoans
      ? [
          line('Loan Interest (from schedule)', loanInterestCurrent, loanInterestPrevious, {
            isSubLine: true,
            noteNo: '24',
            noteKey: 'financeCost',
          }),
        ]
      : []),
    line('Depreciation (from schedule)', depCurrent, depPrevious, {
      noteNo: '9',
      noteKey: 'depreciationAmortization',
      noteSubId: 'less-depreciation',
    }),
    line('Total Expenses', totalExpensesCurrent, totalExpensesPrevious, { isTotal: true }),
    line('Net Profit / (Loss)', netProfitCurrent, netProfitPrevious, { isTotal: true }),
    line('Less: P&L Appropriation', plAppropriationTotal.current, plAppropriationTotal.previous, {
      isSubLine: true,
    }),
    line('Balance Profit transferred to Capital Account', balanceProfitCurrent, balanceProfitPrevious, {
      isTotal: true,
      noteNo: '1',
      noteKey: 'capitalAccount',
      noteSubId: 'balance-profit',
    }),
  ]
}
