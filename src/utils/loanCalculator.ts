import type { Loan, LoanFormInput, LoanMonthRow, LoanRecord, LoanSummary, LoanYearCashFlow } from '../types/loan'

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

function n(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function calculateEmi(principal: number, annualRate: number, tenureMonths: number) {
  const p = n(principal)
  const months = Math.max(1, Math.floor(n(tenureMonths)))

  if (p <= 0) {
    return 0
  }

  const monthlyRate = annualRate / 12 / 100

  if (monthlyRate === 0) {
    return Math.round(p / months)
  }

  const factor = Math.pow(1 + monthlyRate, months)
  return Math.round((p * monthlyRate * factor) / (factor - 1))
}

function isInFinancialYear(date: Date, fyStartYear: number, fyEndYear: number) {
  const fyStart = new Date(fyStartYear, 3, 1)
  const fyEnd = new Date(fyEndYear, 2, 31, 23, 59, 59)
  return date >= fyStart && date <= fyEnd
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function computeLoanForFinancialYear(
  input: LoanFormInput & { id?: string },
  fyStartYear: number,
  fyEndYear: number,
): Loan {
  const fyStart = new Date(fyStartYear, 3, 1)
  const emiStart = input.emiStartDate ? new Date(input.emiStartDate) : fyStart
  const monthlyRate = n(input.interestRate) / 12 / 100

  let balance = n(input.openingBalance)
  let interestForYear = 0
  let principalRepaid = 0
  const monthlySchedule: LoanMonthRow[] = []
  let serialNo = 0

  if (n(input.disbursement) > 0 && input.disbursementDate) {
    const disbDate = new Date(input.disbursementDate)
    if (isInFinancialYear(disbDate, fyStartYear, fyEndYear)) {
      balance += n(input.disbursement)
    } else if (disbDate < fyStart) {
      balance += n(input.disbursement)
    }
  }

  const baseForEmi = balance > 0 ? balance : n(input.openingBalance) + n(input.disbursement)
  const emiAmount = calculateEmi(baseForEmi, n(input.interestRate), n(input.tenureMonths))

  for (let index = 0; index < 12; index += 1) {
    const monthDate = new Date(fyStartYear, 3 + index, 1)

    if (monthDate < emiStart || monthDate > new Date(fyEndYear, 2, 31)) {
      continue
    }

    if (balance <= 0) {
      break
    }

    if (n(input.prepaymentAmount) > 0 && input.prepaymentDate) {
      const prepDate = new Date(input.prepaymentDate)
      if (sameMonth(prepDate, monthDate)) {
        const prepay = Math.min(balance, n(input.prepaymentAmount))
        balance -= prepay
        principalRepaid += prepay
        serialNo += 1
        monthlySchedule.push({
          serialNo,
          month: index + 1,
          monthLabel: MONTHS[index],
          year: monthDate.getFullYear(),
          emi: prepay,
          principal: prepay,
          interest: 0,
          balance,
          isPrepayment: true,
        })
        if (balance <= 0) {
          break
        }
      }
    }

    const interest = Math.round(balance * monthlyRate)
    const principal = Math.min(balance, Math.max(0, emiAmount - interest))
    const emi = interest + principal

    balance -= principal
    interestForYear += interest
    principalRepaid += principal

    serialNo += 1
    monthlySchedule.push({
      serialNo,
      month: index + 1,
      monthLabel: MONTHS[index],
      year: monthDate.getFullYear(),
      emi,
      principal,
      interest,
      balance: Math.max(0, balance),
    })
  }

  return {
    id: input.id || generateId(),
    lender: input.lender.trim(),
    loanType: input.loanType,
    openingBalance: n(input.openingBalance),
    disbursement: n(input.disbursement),
    disbursementDate: input.disbursementDate || '',
    interestRate: n(input.interestRate),
    tenureMonths: n(input.tenureMonths),
    emiStartDate: input.emiStartDate || '',
    prepaymentAmount: n(input.prepaymentAmount),
    prepaymentDate: input.prepaymentDate || '',
    emiAmount,
    interestForYear,
    principalRepaid,
    closingBalance: Math.max(0, balance),
    monthlySchedule,
  }
}

export function summarizeLoans(loans: Loan[]): LoanSummary {
  return loans.reduce(
    (acc, loan) => {
      if (loan.loanType === 'long-term') {
        acc.longTermClosing += loan.closingBalance
      } else {
        acc.shortTermClosing += loan.closingBalance
      }
      acc.totalInterest += loan.interestForYear
      acc.totalPrincipalRepaid += loan.principalRepaid
      return acc
    },
    {
      longTermClosing: 0,
      shortTermClosing: 0,
      totalInterest: 0,
      totalPrincipalRepaid: 0,
    },
  )
}

export function summarizeCashFlowByYear(schedule: LoanMonthRow[]): LoanYearCashFlow[] {
  const byYear = new Map<number, { interestPaid: number; principalPaid: number }>()

  for (const row of schedule) {
    const entry = byYear.get(row.year) || { interestPaid: 0, principalPaid: 0 }
    entry.interestPaid += row.interest
    entry.principalPaid += row.principal
    byYear.set(row.year, entry)
  }

  return [...byYear.entries()]
    .sort(([yearA], [yearB]) => yearA - yearB)
    .map(([year, amounts]) => ({
      year,
      interestPaid: amounts.interestPaid,
      principalPaid: amounts.principalPaid,
      totalPaid: amounts.interestPaid + amounts.principalPaid,
    }))
}

export function mergeCashFlowByYear(loans: Loan[]): LoanYearCashFlow[] {
  const byYear = new Map<number, { interestPaid: number; principalPaid: number }>()

  for (const loan of loans) {
    for (const row of summarizeCashFlowByYear(loan.monthlySchedule)) {
      const entry = byYear.get(row.year) || { interestPaid: 0, principalPaid: 0 }
      entry.interestPaid += row.interestPaid
      entry.principalPaid += row.principalPaid
      byYear.set(row.year, entry)
    }
  }

  return [...byYear.entries()]
    .sort(([yearA], [yearB]) => yearA - yearB)
    .map(([year, amounts]) => ({
      year,
      interestPaid: amounts.interestPaid,
      principalPaid: amounts.principalPaid,
      totalPaid: amounts.interestPaid + amounts.principalPaid,
    }))
}

export function createEmptyLoanForm(): LoanFormInput {
  return {
    lender: '',
    loanType: 'long-term',
    openingBalance: 0,
    disbursement: 0,
    disbursementDate: '',
    interestRate: 0,
    tenureMonths: 12,
    emiStartDate: '',
    prepaymentAmount: 0,
    prepaymentDate: '',
  }
}

export function loanToFormInput(loan: LoanRecord | Loan): LoanFormInput {
  return {
    lender: loan.lender,
    loanType: loan.loanType,
    openingBalance: loan.openingBalance,
    disbursement: loan.disbursement,
    disbursementDate: loan.disbursementDate,
    interestRate: loan.interestRate,
    tenureMonths: loan.tenureMonths,
    emiStartDate: loan.emiStartDate,
    prepaymentAmount: loan.prepaymentAmount,
    prepaymentDate: loan.prepaymentDate,
  }
}

export function migrateRepaymentSchedule(
  rows: {
    id: string
    lender: string
    openingBalance: number
    addition: number
    repayment: number
    closingBalance: number
  }[],
  fyStartYear: number,
  fyEndYear: number,
): LoanRecord[] {
  return rows
    .filter((row) => row.lender || row.openingBalance || row.addition)
    .map((row) => {
      const loan = computeLoanForFinancialYear(
        {
          id: row.id,
          lender: row.lender,
          loanType: 'long-term',
          openingBalance: row.openingBalance,
          disbursement: row.addition,
          disbursementDate: `${fyStartYear}-04-01`,
          interestRate: 0,
          tenureMonths: 12,
          emiStartDate: `${fyStartYear}-04-01`,
          prepaymentAmount: row.repayment,
          prepaymentDate: row.repayment ? `${fyEndYear}-03-01` : '',
        },
        fyStartYear,
        fyEndYear,
      )
      return loanToRecord(loan)
    })
}

export function loanToRecord(loan: Loan | LoanRecord): LoanRecord {
  return {
    id: loan.id,
    lender: loan.lender,
    loanType: loan.loanType,
    openingBalance: loan.openingBalance,
    disbursement: loan.disbursement,
    disbursementDate: loan.disbursementDate,
    interestRate: loan.interestRate,
    tenureMonths: loan.tenureMonths,
    emiStartDate: loan.emiStartDate,
    prepaymentAmount: loan.prepaymentAmount,
    prepaymentDate: loan.prepaymentDate,
  }
}

export function normalizeLoans(
  loans: LoanRecord[] | undefined,
  repaymentSchedule: { id: string; lender: string; openingBalance: number; addition: number; repayment: number; closingBalance: number }[] | undefined,
  fyStartYear: number,
  fyEndYear: number,
): LoanRecord[] {
  if (loans && loans.length > 0) {
    return loans
  }
  if (repaymentSchedule && repaymentSchedule.length > 0) {
    return migrateRepaymentSchedule(repaymentSchedule, fyStartYear, fyEndYear)
  }
  return []
}

export function recomputeLoansForFy(loans: LoanRecord[], fyStartYear: number, fyEndYear: number) {
  return loans.map((loan) => computeLoanForFinancialYear(loan, fyStartYear, fyEndYear))
}

export function sumOpeningByType(loans: LoanRecord[], loanType: 'long-term' | 'short-term') {
  return loans
    .filter((loan) => loan.loanType === loanType)
    .reduce((total, loan) => total + (Number(loan.openingBalance) || 0), 0)
}
