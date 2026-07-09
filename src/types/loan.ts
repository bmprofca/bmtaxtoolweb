export type LoanType = 'long-term' | 'short-term'

export interface LoanRecord {
  id: string
  lender: string
  loanType: LoanType
  openingBalance: number
  disbursement: number
  disbursementDate: string
  interestRate: number
  tenureMonths: number
  emiStartDate: string
  prepaymentAmount: number
  prepaymentDate: string
}

export interface LoanMonthRow {
  serialNo: number
  month: number
  monthLabel: string
  year: number
  emi: number
  principal: number
  interest: number
  balance: number
  isPrepayment?: boolean
  isPreClosure?: boolean
}

export interface Loan {
  id: string
  lender: string
  loanType: LoanType
  openingBalance: number
  disbursement: number
  disbursementDate: string
  interestRate: number
  tenureMonths: number
  emiStartDate: string
  prepaymentAmount: number
  prepaymentDate: string
  emiAmount: number
  interestForYear: number
  principalRepaid: number
  closingBalance: number
  monthlySchedule: LoanMonthRow[]
}

export type LoanFormInput = Omit<LoanRecord, 'id'>

export interface LoanSummary {
  longTermClosing: number
  shortTermClosing: number
  totalInterest: number
  totalPrincipalRepaid: number
}

export interface LoanYearCashFlow {
  year: number
  interestPaid: number
  principalPaid: number
  totalPaid: number
}

export interface LoanHistoryRow {
  id: string
  fyId: string
  fyLabel: string
  fyStartYear: number
  loanId: string
  loan: LoanRecord
  emiAmount: number
  interestForYear: number
  principalRepaid: number
  closingBalance: number
  monthlySchedule: LoanMonthRow[]
}

export interface LoanFySummary {
  fyId: string
  fyLabel: string
  fyStartYear: number
  longTermClosing: number
  shortTermClosing: number
  totalInterest: number
  totalPrincipalRepaid: number
  consolidatedCashFlow: LoanYearCashFlow[]
}
