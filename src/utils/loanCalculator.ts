import type {
  Loan,
  LoanClosingAdjustmentMode,
  LoanFormInput,
  LoanMonthRow,
  LoanRecord,
  LoanSummary,
  LoanYearCashFlow,
} from '../types/loan'

const CALENDAR_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function n(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function parseLoanYearMonth(value: string) {
  if (!value) {
    return null
  }

  const parts = value.split('-')
  if (parts.length < 2) {
    return null
  }

  const year = Number(parts[0])
  const month = Number(parts[1])

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }

  return { year, month }
}

function yearMonthKey(year: number, month: number) {
  return year * 12 + month
}

function isBeforeYearMonth(
  left: { year: number; month: number },
  right: { year: number; month: number },
) {
  return yearMonthKey(left.year, left.month) < yearMonthKey(right.year, right.month)
}

function isAfterYearMonth(
  left: { year: number; month: number },
  right: { year: number; month: number },
) {
  return yearMonthKey(left.year, left.month) > yearMonthKey(right.year, right.month)
}

export function normalizeLoanMonthField(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return ''
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})/)
  if (!match) {
    return ''
  }

  return `${match[1]}-${match[2]}-01`
}

export function toLoanMonthStartIso(value: string) {
  const normalized = normalizeLoanMonthField(value)
  if (!normalized) {
    return ''
  }

  return normalized
}

export function resolveEmiStartDate(
  input: { emiStartDate?: string; disbursementDate?: string },
  fyStartYear: number,
) {
  if (input.emiStartDate) {
    return toLoanMonthStartIso(input.emiStartDate)
  }

  if (input.disbursementDate) {
    return toLoanMonthStartIso(input.disbursementDate)
  }

  return `${fyStartYear}-04-01`
}

export function formatLoanInstallmentPeriod(value: string) {
  const parsed = parseLoanYearMonth(value)
  if (!parsed) {
    return '—'
  }

  return `${MONTH_LABELS[parsed.month - 1]} ${parsed.year}`
}

export function getFinancialYearMonthBounds(fyStartYear: number, fyEndYear: number) {
  return {
    min: `${fyStartYear}-04`,
    max: `${fyEndYear}-03`,
  }
}

export function clampLoanMonthToFinancialYear(value: string, fyStartYear: number, fyEndYear: number) {
  const parsed = parseLoanYearMonth(value)
  if (!parsed) {
    return `${fyStartYear}-04-01`
  }

  const bounds = getFinancialYearMonthBounds(fyStartYear, fyEndYear)
  const min = parseLoanYearMonth(bounds.min)!
  const max = parseLoanYearMonth(bounds.max)!

  if (isBeforeYearMonth(parsed, min)) {
    return toLoanMonthStartIso(bounds.min)
  }

  if (isAfterYearMonth(parsed, max)) {
    return toLoanMonthStartIso(bounds.max)
  }

  return toLoanMonthStartIso(value)
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

function addCalendarMonths(ym: { year: number; month: number }, delta: number) {
  const index = ym.year * 12 + (ym.month - 1) + delta
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  }
}

function sameCalendarMonth(dateValue: string, ym: { year: number; month: number }) {
  const parsed = parseLoanYearMonth(
    dateValue.includes('T') ? dateValue : toLoanMonthStartIso(dateValue),
  )
  if (!parsed) {
    return false
  }

  return parsed.year === ym.year && parsed.month === ym.month
}

export function isCalendarMonthInFinancialYear(
  year: number,
  month: number,
  fyStartYear: number,
  fyEndYear: number,
) {
  if (month >= 4) {
    return year === fyStartYear
  }

  return year === fyEndYear
}

export function isLoanFullyRepaid(
  loan: Pick<Loan, 'monthlySchedule' | 'tenureMonths' | 'openingBalance' | 'disbursement'>,
): boolean {
  const tenureMonths = Math.floor(n(loan.tenureMonths))
  if (tenureMonths < 1) {
    return false
  }

  const principal = n(loan.openingBalance) + n(loan.disbursement)
  if (principal <= 0) {
    return false
  }

  if (!loan.monthlySchedule.length) {
    return false
  }

  const last = loan.monthlySchedule[loan.monthlySchedule.length - 1]
  return last.balance <= 0
}

function resolveClosingBalanceAtFyEnd(
  input: LoanFormInput,
  fullSchedule: LoanMonthRow[],
  fyStartYear: number,
  fyEndYear: number,
) {
  const fyEndYm = { year: fyEndYear, month: 3 }
  const rowsOnOrBefore = fullSchedule.filter((row) => {
    const ym = { year: row.year, month: row.month }
    return !isAfterYearMonth(ym, fyEndYm)
  })

  if (rowsOnOrBefore.length > 0) {
    return rowsOnOrBefore[rowsOnOrBefore.length - 1].balance
  }

  let balance = n(input.openingBalance)
  const disbYm = input.disbursementDate
    ? parseLoanYearMonth(toLoanMonthStartIso(input.disbursementDate))
    : null
  const fyStartYm = { year: fyStartYear, month: 4 }

  if (n(input.disbursement) > 0 && disbYm && !isAfterYearMonth(disbYm, fyEndYm)) {
    if (!isBeforeYearMonth(disbYm, fyStartYm)) {
      balance += n(input.disbursement)
    } else {
      balance += n(input.disbursement)
    }
  }

  return Math.max(0, balance)
}

/** Full EMI schedule from start installment until loan is closed or tenure ends. */
export function computeFullLoanSchedule(
  input: LoanFormInput & { id?: string },
  fyStartYear: number,
): LoanMonthRow[] {
  const resolvedEmiStartDate = resolveEmiStartDate(input, fyStartYear)
  const emiStartYm = parseLoanYearMonth(resolvedEmiStartDate)
  if (!emiStartYm) {
    return []
  }

  const monthlyRate = n(input.interestRate) / 12 / 100
  let balance = n(input.openingBalance)

  const disbYm = input.disbursementDate
    ? parseLoanYearMonth(toLoanMonthStartIso(input.disbursementDate))
    : null
  const disbAddedUpfront = Boolean(
    disbYm && n(input.disbursement) > 0 && !isAfterYearMonth(disbYm, emiStartYm),
  )

  if (disbAddedUpfront) {
    balance += n(input.disbursement)
  }

  const baseForEmi = balance > 0 ? balance : n(input.openingBalance) + n(input.disbursement)
  const tenureMonths = Math.floor(n(input.tenureMonths))
  if (tenureMonths < 1 || baseForEmi <= 0) {
    return []
  }

  const emiAmount = calculateEmi(baseForEmi, n(input.interestRate), tenureMonths)
  const maxInstallments = tenureMonths

  const schedule: LoanMonthRow[] = []
  let serialNo = 0
  let installments = 0
  let prepaymentApplied = false
  let currentYm = emiStartYm
  let disbApplied = disbAddedUpfront

  while (balance > 0 && installments < maxInstallments) {
    if (!disbApplied && disbYm && n(input.disbursement) > 0) {
      if (currentYm.year === disbYm.year && currentYm.month === disbYm.month) {
        balance += n(input.disbursement)
        disbApplied = true
      }
    }

    if (balance <= 0) {
      break
    }

    if (!prepaymentApplied && n(input.prepaymentAmount) > 0 && input.prepaymentDate) {
      if (sameCalendarMonth(input.prepaymentDate, currentYm)) {
        const prepay = Math.min(balance, n(input.prepaymentAmount))
        balance -= prepay
        serialNo += 1
        schedule.push({
          serialNo,
          month: currentYm.month,
          monthLabel: CALENDAR_MONTH_LABELS[currentYm.month - 1],
          year: currentYm.year,
          emi: prepay,
          principal: prepay,
          interest: 0,
          balance: Math.max(0, balance),
          isPrepayment: true,
          isPreClosure: true,
        })
        prepaymentApplied = true
        if (balance <= 0) {
          break
        }
      }
    }

    const interest = Math.round(balance * monthlyRate)
    const principal = Math.min(balance, Math.max(0, emiAmount - interest))
    const emi = interest + principal

    balance -= principal
    serialNo += 1
    schedule.push({
      serialNo,
      month: currentYm.month,
      monthLabel: CALENDAR_MONTH_LABELS[currentYm.month - 1],
      year: currentYm.year,
      emi,
      principal,
      interest,
      balance: Math.max(0, balance),
    })

    installments += 1
    currentYm = addCalendarMonths(currentYm, 1)
  }

  return schedule
}

function sameYearMonth(
  left: { year: number; month: number },
  right: { year: number; month: number },
) {
  return left.year === right.year && left.month === right.month
}

/** Outstanding principal at the start of the selected month (before that month's EMI / pre-closure). */
export function getLoanBalanceAtMonthStart(
  input: LoanFormInput,
  fyStartYear: number,
  targetDate: string,
): number {
  const targetYm = parseLoanYearMonth(normalizeLoanMonthField(targetDate))
  if (!targetYm) {
    return 0
  }

  const inputWithoutPreClosure: LoanFormInput = {
    ...input,
    prepaymentAmount: 0,
    prepaymentDate: '',
  }

  const resolvedEmiStartDate = resolveEmiStartDate(inputWithoutPreClosure, fyStartYear)
  const emiStartYm = parseLoanYearMonth(resolvedEmiStartDate)
  if (!emiStartYm) {
    return 0
  }

  let balance = n(inputWithoutPreClosure.openingBalance)
  const disbYm = inputWithoutPreClosure.disbursementDate
    ? parseLoanYearMonth(toLoanMonthStartIso(inputWithoutPreClosure.disbursementDate))
    : null
  const disbAddedUpfront = Boolean(
    disbYm && n(inputWithoutPreClosure.disbursement) > 0 && !isAfterYearMonth(disbYm, emiStartYm),
  )

  if (disbAddedUpfront) {
    balance += n(inputWithoutPreClosure.disbursement)
  }

  const baseForEmi =
    balance > 0
      ? balance
      : n(inputWithoutPreClosure.openingBalance) + n(inputWithoutPreClosure.disbursement)
  const tenureMonths = Math.floor(n(inputWithoutPreClosure.tenureMonths))
  if (tenureMonths < 1 || baseForEmi <= 0) {
    return 0
  }

  if (isBeforeYearMonth(targetYm, emiStartYm)) {
    if (
      !disbAddedUpfront &&
      disbYm &&
      n(inputWithoutPreClosure.disbursement) > 0 &&
      !isAfterYearMonth(disbYm, targetYm)
    ) {
      balance += n(inputWithoutPreClosure.disbursement)
    }
    return Math.max(0, balance)
  }

  const monthlyRate = n(inputWithoutPreClosure.interestRate) / 12 / 100
  const emiAmount = calculateEmi(
    baseForEmi,
    n(inputWithoutPreClosure.interestRate),
    tenureMonths,
  )
  const maxInstallments = tenureMonths

  let installments = 0
  let currentYm = emiStartYm
  let disbApplied = disbAddedUpfront

  while (balance > 0 && installments < maxInstallments) {
    if (!disbApplied && disbYm && n(inputWithoutPreClosure.disbursement) > 0) {
      if (sameYearMonth(currentYm, disbYm)) {
        balance += n(inputWithoutPreClosure.disbursement)
        disbApplied = true
      }
    }

    if (sameYearMonth(currentYm, targetYm)) {
      return Math.max(0, balance)
    }

    if (balance <= 0) {
      break
    }

    const interest = Math.round(balance * monthlyRate)
    const principal = Math.min(balance, Math.max(0, emiAmount - interest))
    balance -= principal
    installments += 1
    currentYm = addCalendarMonths(currentYm, 1)
  }

  return 0
}

export function normalizeClosingAdjustmentMode(value: unknown): LoanClosingAdjustmentMode {
  return value === 'target-balance' ? 'target-balance' : 'principal-interest'
}

export function defaultClosingAdjustmentFields(): Pick<
  LoanFormInput,
  | 'closingAdjustmentEnabled'
  | 'closingAdjustmentMode'
  | 'closingAdjustmentPrincipal'
  | 'closingAdjustmentInterest'
  | 'closingAdjustmentTargetBalance'
> {
  return {
    closingAdjustmentEnabled: false,
    closingAdjustmentMode: 'principal-interest',
    closingAdjustmentPrincipal: 0,
    closingAdjustmentInterest: 0,
    closingAdjustmentTargetBalance: 0,
  }
}

export function applyClosingBalanceAdjustments(
  computed: { interestForYear: number; principalRepaid: number; closingBalance: number },
  input: Pick<
    LoanFormInput,
    | 'closingAdjustmentEnabled'
    | 'closingAdjustmentMode'
    | 'closingAdjustmentPrincipal'
    | 'closingAdjustmentInterest'
    | 'closingAdjustmentTargetBalance'
  >,
) {
  if (!input.closingAdjustmentEnabled) {
    return {
      interestForYear: computed.interestForYear,
      principalRepaid: computed.principalRepaid,
      closingBalance: computed.closingBalance,
      principalAdjustment: 0,
      interestAdjustment: 0,
      scheduleClosingBalance: computed.closingBalance,
    }
  }

  if (input.closingAdjustmentMode === 'target-balance') {
    const target = Math.max(0, n(input.closingAdjustmentTargetBalance))
    const principalAdjustment = computed.closingBalance - target
    return {
      interestForYear: computed.interestForYear,
      principalRepaid: computed.principalRepaid + principalAdjustment,
      closingBalance: target,
      principalAdjustment,
      interestAdjustment: 0,
      scheduleClosingBalance: computed.closingBalance,
    }
  }

  const principalAdjustment = n(input.closingAdjustmentPrincipal)
  const interestAdjustment = n(input.closingAdjustmentInterest)
  return {
    interestForYear: computed.interestForYear + interestAdjustment,
    principalRepaid: computed.principalRepaid + principalAdjustment,
    closingBalance: Math.max(0, computed.closingBalance - principalAdjustment),
    principalAdjustment,
    interestAdjustment,
    scheduleClosingBalance: computed.closingBalance,
  }
}

export function computeLoanForFinancialYear(
  input: LoanFormInput & { id?: string },
  fyStartYear: number,
  fyEndYear: number,
): Loan {
  const resolvedEmiStartDate = resolveEmiStartDate(input, fyStartYear)
  const fullSchedule = computeFullLoanSchedule(input, fyStartYear)

  let interestForYear = 0
  let principalRepaid = 0
  for (const row of fullSchedule) {
    if (isCalendarMonthInFinancialYear(row.year, row.month, fyStartYear, fyEndYear)) {
      interestForYear += row.interest
      principalRepaid += row.principal
    }
  }

  const closingBalance = resolveClosingBalanceAtFyEnd(input, fullSchedule, fyStartYear, fyEndYear)

  let balance = n(input.openingBalance)
  const disbYm = input.disbursementDate
    ? parseLoanYearMonth(toLoanMonthStartIso(input.disbursementDate))
    : null
  const emiStartYm = parseLoanYearMonth(resolvedEmiStartDate)!
  const disbAddedUpfront = Boolean(
    disbYm && n(input.disbursement) > 0 && !isAfterYearMonth(disbYm, emiStartYm),
  )

  if (disbAddedUpfront) {
    balance += n(input.disbursement)
  }

  const baseForEmi = balance > 0 ? balance : n(input.openingBalance) + n(input.disbursement)
  const emiAmount = calculateEmi(baseForEmi, n(input.interestRate), n(input.tenureMonths))

  const adjusted = applyClosingBalanceAdjustments(
    { interestForYear, principalRepaid, closingBalance },
    input,
  )

  return {
    id: input.id || generateId(),
    lender: input.lender.trim(),
    loanType: input.loanType,
    openingBalance: n(input.openingBalance),
    disbursement: n(input.disbursement),
    disbursementDate: input.disbursementDate || '',
    interestRate: n(input.interestRate),
    tenureMonths: n(input.tenureMonths),
    emiStartDate: resolvedEmiStartDate,
    prepaymentAmount: n(input.prepaymentAmount),
    prepaymentDate: input.prepaymentDate || '',
    emiAmount,
    interestForYear: adjusted.interestForYear,
    principalRepaid: adjusted.principalRepaid,
    closingBalance: adjusted.closingBalance,
    monthlySchedule: fullSchedule,
    scheduleClosingBalance: adjusted.scheduleClosingBalance,
    closingAdjustmentPrincipalApplied: adjusted.principalAdjustment,
    closingAdjustmentInterestApplied: adjusted.interestAdjustment,
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

export function createEmptyLoanForm(fyStartYear?: number): LoanFormInput {
  const defaultMonth = fyStartYear ? normalizeLoanMonthField(`${fyStartYear}-04`) : ''
  return {
    lender: '',
    loanType: 'long-term',
    openingBalance: 0,
    disbursement: 0,
    disbursementDate: defaultMonth,
    interestRate: 0,
    tenureMonths: 12,
    emiStartDate: defaultMonth,
    prepaymentAmount: 0,
    prepaymentDate: '',
    ...defaultClosingAdjustmentFields(),
  }
}

export function loanToFormInput(loan: LoanRecord | Loan): LoanFormInput {
  const closingFields =
    'closingAdjustmentEnabled' in loan
      ? {
          closingAdjustmentEnabled: Boolean(loan.closingAdjustmentEnabled),
          closingAdjustmentMode: normalizeClosingAdjustmentMode(loan.closingAdjustmentMode),
          closingAdjustmentPrincipal: n(loan.closingAdjustmentPrincipal),
          closingAdjustmentInterest: n(loan.closingAdjustmentInterest),
          closingAdjustmentTargetBalance: n(loan.closingAdjustmentTargetBalance),
        }
      : defaultClosingAdjustmentFields()

  return {
    lender: loan.lender,
    loanType: loan.loanType,
    openingBalance: loan.openingBalance,
    disbursement: loan.disbursement,
    disbursementDate: normalizeLoanMonthField(loan.disbursementDate),
    interestRate: loan.interestRate,
    tenureMonths: loan.tenureMonths,
    emiStartDate: normalizeLoanMonthField(loan.emiStartDate),
    prepaymentAmount: loan.prepaymentAmount,
    prepaymentDate: normalizeLoanMonthField(loan.prepaymentDate),
    ...closingFields,
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
          ...defaultClosingAdjustmentFields(),
        },
        fyStartYear,
        fyEndYear,
      )
      return loanToRecord(loan)
    })
}

export function loanToRecord(loan: Loan | LoanRecord): LoanRecord {
  const closingFields =
    'closingAdjustmentEnabled' in loan
      ? {
          closingAdjustmentEnabled: Boolean(loan.closingAdjustmentEnabled),
          closingAdjustmentMode: normalizeClosingAdjustmentMode(loan.closingAdjustmentMode),
          closingAdjustmentPrincipal: n(loan.closingAdjustmentPrincipal),
          closingAdjustmentInterest: n(loan.closingAdjustmentInterest),
          closingAdjustmentTargetBalance: n(loan.closingAdjustmentTargetBalance),
        }
      : defaultClosingAdjustmentFields()

  return {
    id: loan.id,
    lender: loan.lender,
    loanType: loan.loanType,
    openingBalance: loan.openingBalance,
    disbursement: loan.disbursement,
    disbursementDate: normalizeLoanMonthField(loan.disbursementDate),
    interestRate: loan.interestRate,
    tenureMonths: loan.tenureMonths,
    emiStartDate: normalizeLoanMonthField(loan.emiStartDate),
    prepaymentAmount: loan.prepaymentAmount,
    prepaymentDate: normalizeLoanMonthField(loan.prepaymentDate),
    ...closingFields,
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
