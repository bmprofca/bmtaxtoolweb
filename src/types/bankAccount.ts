export const BANK_ACCOUNT_TYPES = [
  { id: 'savings', label: 'Savings Account' },
  { id: 'current', label: 'Current Account' },
  { id: 'od', label: 'Overdraft (OD)' },
  { id: 'cc', label: 'Cash Credit (CC)' },
  { id: 'fd', label: 'Fixed Deposit (FD)' },
  { id: 'others', label: 'Others' },
] as const

export type BankAccountTypeId = (typeof BANK_ACCOUNT_TYPES)[number]['id']

export interface BankAccountRecord {
  id: string
  bankName: string
  accountNumber: string
  accountType: BankAccountTypeId
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
  openingBalance: number
  debit: number
  credit: number
  bankCharge: number
  interest: number
  closingBalance: number
}
