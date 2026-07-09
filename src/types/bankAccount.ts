export const BANK_ACCOUNT_TYPES = [
  { id: 'savings', label: 'Savings Account' },
  { id: 'current', label: 'Current Account' },
  { id: 'od', label: 'Overdraft (OD)' },
  { id: 'cc', label: 'Cash Credit (CC)' },
  { id: 'fd', label: 'Fixed Deposit (FD)' },
  { id: 'others', label: 'Others' },
] as const

export type BankAccountTypeId = (typeof BANK_ACCOUNT_TYPES)[number]['id']

export const BANK_ACCOUNT_STATUSES = [
  { id: 'active', label: 'Active' },
  { id: 'closed', label: 'Closed' },
] as const

export type BankAccountStatus = (typeof BANK_ACCOUNT_STATUSES)[number]['id']

export interface BankAccountRecord {
  id: string
  bankName: string
  accountNumber: string
  accountType: BankAccountTypeId
  /** Active accounts carry forward to the next FY; closed accounts appear only in the FY they were closed. */
  status: BankAccountStatus
  /** Set when status is closed — the FY in which the account was closed. */
  closedInFyId?: string
  openingBalance: number
  debit: number
  credit: number
  bankCharge: number
  /** Positive = interest income, negative = interest expense */
  interest: number
  /** Manual closing balance: positive = credit balance, negative = debit (OD) balance */
  closingBalance: number
}

export interface BankAccountFormInput {
  bankName: string
  accountNumber: string
  accountType: BankAccountTypeId
  status: BankAccountStatus
}

export interface BankAccountHistoryRow {
  id: string
  fyId: string
  fyLabel: string
  fyStartYear: number
  bankAccountId: string
  bankName: string
  accountNumber: string
  accountType: BankAccountTypeId
  status: BankAccountStatus
  closedInFyId?: string
  openingBalance: number
  debit: number
  credit: number
  bankCharge: number
  interest: number
  closingBalance: number
}
