import type {
  ComputedStatements,
  DepreciationRow,
  FsNotes,
  NoteValue,
  PreviousYearDepreciationSummary,
} from '../types/fs'
import type { LoanRecord } from '../types/loan'
import { recalcDepreciationRow } from './depreciation'
import { computeLoanForFinancialYear, summarizeLoans } from './loanCalculator'
import { buildProfitLossLines } from './plBuilder'

function sumDepreciation(rows: DepreciationRow[], field: 'depreciation' | 'closingWdv') {
  return rows.reduce((total, row) => {
    const updated = recalcDepreciationRow(row)
    return total + (field === 'depreciation' ? updated.depreciation : updated.closingWdv)
  }, 0)
}

function n(value: number) {
  return Number.isFinite(value) ? value : 0
}

export function computeStatements(
  notes: FsNotes,
  depreciationSchedule: DepreciationRow[],
  loans: LoanRecord[],
  fyStartYear: number,
  fyEndYear: number,
  previousYearDepreciation: PreviousYearDepreciationSummary = {
    openingWdv: 0,
    additionBeforeOct3: 0,
    additionOnAfterOct3: 0,
    assetDeletion: 0,
    depreciation: 0,
    closingWdv: 0,
  },
  plAppropriationTotal: NoteValue = { current: 0, previous: 0 },
): ComputedStatements {
  const depCurrent = sumDepreciation(depreciationSchedule, 'depreciation')
  const depPrevious = previousYearDepreciation.depreciation

  const computedLoans = loans.map((loan) => computeLoanForFinancialYear(loan, fyStartYear, fyEndYear))
  const loanSummary = summarizeLoans(computedLoans)

  const hasLoans = loans.length > 0
  const longTermCurrent = notes.longTermBorrowings.current
  const longTermPrevious = notes.longTermBorrowings.previous
  const shortTermCurrent = notes.shortTermBorrowings.current
  const shortTermPrevious = notes.shortTermBorrowings.previous
  const loanInterestCurrent = hasLoans ? loanSummary.totalInterest : 0
  const loanInterestPrevious = 0
  const totalLoanCurrent = longTermCurrent + shortTermCurrent
  const totalLoanPrevious = longTermPrevious + shortTermPrevious

  const profitAndLoss = buildProfitLossLines({
    notes,
    depCurrent,
    depPrevious,
    loanInterestCurrent,
    loanInterestPrevious,
    hasLoans,
    plAppropriationTotal,
  })

  return {
    balanceSheet: [],
    profitAndLoss,
    totalDepreciation: { current: depCurrent, previous: depPrevious },
    totalLoanClosing: { current: totalLoanCurrent, previous: totalLoanPrevious },
    longTermClosing: { current: longTermCurrent, previous: longTermPrevious },
    shortTermClosing: { current: shortTermCurrent, previous: shortTermPrevious },
    loanInterest: { current: loanInterestCurrent, previous: loanInterestPrevious },
  }
}

export function formatAmount(value: number) {
  return n(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export function formatStatementAmount(value: number) {
  if (!value) {
    return '—'
  }
  return n(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatBalanceSheetAsAtLabel(endYear: number) {
  return `As at 31st March ${endYear}`
}

export function calcValueChange(current: number, previous: number) {
  return n(current) - n(previous)
}

export function calcPercentChange(current: number, previous: number): number | null {
  const prev = n(previous)
  const curr = n(current)
  if (prev === 0) {
    return curr === 0 ? 0 : null
  }
  return ((curr - prev) / Math.abs(prev)) * 100
}

export function formatChangeAmount(value: number) {
  if (value > 0) {
    return `+${formatAmount(value)}`
  }
  if (value < 0) {
    return formatAmount(value)
  }
  return '0'
}

export function formatPercentChange(value: number | null) {
  if (value === null) {
    return '—'
  }
  if (value > 0) {
    return `+${value.toFixed(1)}%`
  }
  if (value < 0) {
    return `${value.toFixed(1)}%`
  }
  return '0.0%'
}

export function varianceClass(value: number) {
  if (value > 0) {
    return 'variance-up'
  }
  if (value < 0) {
    return 'variance-down'
  }
  return 'variance-flat'
}
